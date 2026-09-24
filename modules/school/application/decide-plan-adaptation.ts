import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { PlanAdaptationStatus } from "../domain/enums";
import { schoolMetrics } from "../infrastructure/metrics";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const decidePlanAdaptationSchema = z.strictObject({
  licenseId: id,
  adaptationId: id,
  decision: z.enum(["ACCEPT", "DECLINE"]),
});
export type DecidePlanAdaptationInput = z.infer<typeof decidePlanAdaptationSchema>;

type ProposedSnapshot = { scheduledAt: string | null; dueAt: string | null; workoutTemplateId: string };

/**
 * TM075 (RF-303, design D-06) — ONLY the athlete who owns the license may
 * decide. On ACCEPT: applies the proposed change to the `WorkoutAssignment`,
 * increments `adaptationVersion` (RNF-003, so a second, now-stale proposal
 * on the same assignment fails at propose time — see ProposePlanAdaptation),
 * records `acceptedByAthleteAt`, and stamps `effectiveRevisionId`/
 * `adjustedByCoachId`/`originalSnapshot` (TM007 fields, "who adapted this
 * session"). Appends a `WorkoutAssignmentHistory` row for audit, same
 * pattern `RescheduleWorkout` already uses. On DECLINE: no assignment change
 * at all — only the `PlanAdaptation.status` moves.
 *
 * Never touches `TrainingProductVersion` (RF-004) or any other buyer's
 * license — the lookup chain is adaptation -> its own license -> its own
 * assignment, all scoped by `licenseId` from the URL.
 */
export class DecidePlanAdaptation {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorAthleteId: string | null, raw: unknown) {
    const actor = id.safeParse(actorAthleteId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = decidePlanAdaptationSchema.parse(raw);
    const now = this.clock();

    try {
      return await this.db.$transaction(async (tx) => {
        const adaptation = await tx.planAdaptation.findUnique({
          where: { id: input.adaptationId },
          select: {
            id: true, licenseId: true, workoutAssignmentId: true, coachId: true, status: true,
            proposedSnapshot: true, expectedVersion: true,
          },
        });
        if (!adaptation || adaptation.licenseId !== input.licenseId) {
          throw new SchoolError("ADAPTATION_NOT_FOUND", "Ajuste não encontrado.", 404);
        }

        const license = await tx.trainingLicense.findUnique({ where: { id: input.licenseId }, select: { athleteId: true } });
        if (!license) throw new SchoolError("LICENSE_NOT_FOUND", "Licença não encontrada.", 404);
        // task-list.md TM075/TM080 criterio — explicit 403 for "not the owning athlete" (coach, school OWNER, or any other athlete).
        if (license.athleteId !== actor.data) {
          throw new SchoolError("FORBIDDEN", "Apenas o atleta dono da licença decide este ajuste.", 403);
        }

        if (adaptation.status !== PlanAdaptationStatus.PENDING) {
          throw new SchoolError("ADAPTATION_NOT_PENDING", "Este ajuste já foi decidido.", 409);
        }

        if (input.decision === "DECLINE") {
          const declined = await tx.planAdaptation.update({
            where: { id: adaptation.id },
            data: { status: PlanAdaptationStatus.DECLINED, updatedAt: now },
          });
          schoolMetrics.marketplaceAdaptationDecided({
            licenseId: input.licenseId, adaptationId: adaptation.id, decision: "DECLINED", coachId: adaptation.coachId,
          });
          return { adaptation: declined, assignment: null };
        }

        // ACCEPT
        const assignment = await tx.workoutAssignment.findUnique({
          where: { id: adaptation.workoutAssignmentId },
          select: {
            id: true, adaptationVersion: true, scheduledAt: true, dueAt: true, workoutTemplateId: true, originalSnapshot: true,
          },
        });
        if (!assignment) throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Sessão não encontrada.", 404);
        if (assignment.adaptationVersion !== adaptation.expectedVersion) {
          throw new SchoolError("ADAPTATION_VERSION_CONFLICT", "A sessão mudou desde a proposta. Peça uma nova proposta ao professor.", 409);
        }

        const proposed = adaptation.proposedSnapshot as unknown as ProposedSnapshot;
        const originalSnapshot = assignment.originalSnapshot ?? {
          scheduledAt: assignment.scheduledAt?.toISOString() ?? null,
          dueAt: assignment.dueAt?.toISOString() ?? null,
          workoutTemplateId: assignment.workoutTemplateId,
        };

        const updatedAssignment = await tx.workoutAssignment.update({
          where: { id: assignment.id },
          data: {
            scheduledAt: proposed.scheduledAt ? new Date(proposed.scheduledAt) : null,
            dueAt: proposed.dueAt ? new Date(proposed.dueAt) : null,
            workoutTemplateId: proposed.workoutTemplateId,
            adaptationVersion: { increment: 1 },
            effectiveRevisionId: adaptation.id,
            adjustedByCoachId: adaptation.coachId,
            originalSnapshot,
            updatedAt: now,
          },
        });

        await tx.workoutAssignmentHistory.create({
          data: {
            id: randomUUID(),
            workoutAssignmentId: assignment.id,
            eventType: "PLAN_ADAPTATION_ACCEPTED",
            actorUserId: actor.data,
            payload: { adaptationId: adaptation.id, coachId: adaptation.coachId, before: originalSnapshot, after: proposed },
            createdAt: now,
          },
        });

        const acceptedAdaptation = await tx.planAdaptation.update({
          where: { id: adaptation.id },
          data: { status: PlanAdaptationStatus.ACCEPTED, acceptedByAthleteAt: now, updatedAt: now },
        });

        schoolMetrics.marketplaceAdaptationDecided({
          licenseId: input.licenseId, adaptationId: adaptation.id, decision: "ACCEPTED", coachId: adaptation.coachId,
        });

        return { adaptation: acceptedAdaptation, assignment: updatedAssignment };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new SchoolError("ADAPTATION_VERSION_CONFLICT", "A sessão foi alterada. Recarregue e tente novamente.", 409);
      }
      throw error;
    }
  }
}
