import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { LicenseCoachEngagementStatus, TrainingLicenseStatus } from "../domain/enums";
import { licenseCoachEngagementScopeSchema, scopeIncludesSportType } from "../domain/license-coach-scope";
import { schoolMetrics } from "../infrastructure/metrics";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const isoDate = z.union([z.iso.datetime(), z.date()]).transform((v) => new Date(v));

/**
 * What a coach may actually propose changing on ONE `WorkoutAssignment`:
 * when it happens (`scheduledAt`/`dueAt`) or which template it prescribes
 * ("substituição", spec §4.3 step 3). There is no `note`/"blocks" column on
 * `WorkoutAssignment` to carry free-form volume/block edits yet — `reason`
 * (mandatory, below) is where the coach explains the change in prose; this
 * is a deliberate MVP scope, not an oversight.
 */
export const planAdaptationChangeSchema = z.strictObject({
  scheduledAt: isoDate.optional(),
  dueAt: isoDate.nullable().optional(),
  workoutTemplateId: id.optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "Informe ao menos um campo para ajustar." });
export type PlanAdaptationChange = z.infer<typeof planAdaptationChangeSchema>;

export const proposePlanAdaptationSchema = z.strictObject({
  licenseId: id,
  workoutAssignmentId: id,
  proposedChange: planAdaptationChangeSchema,
  reason: z.string().trim().min(1).max(1000),
  /** Optimistic-concurrency token — must match `WorkoutAssignment.adaptationVersion` (RNF-003). */
  expectedVersion: z.number().int().min(0),
});
export type ProposePlanAdaptationInput = z.infer<typeof proposePlanAdaptationSchema>;

/**
 * TM074 (RF-303, design D-06) — a coach with an ACTIVE `LicenseCoachEngagement`
 * on this license proposes a change to ONE `WorkoutAssignment`. Creates a
 * `PlanAdaptation` (before/after snapshot, mandatory reason) — never writes
 * to the `WorkoutAssignment` itself (that only happens on athlete acceptance,
 * `DecidePlanAdaptation`/TM075) and never touches `TrainingProductVersion` or
 * any other buyer's license: the assignment lookup is scoped to
 * `trainingLicenseId === input.licenseId`, the exact license the engagement
 * covers.
 *
 * RF-305 (TM085) — when the engagement's scope is partial
 * (`{ sportTypes: [...] }`), the assignment's modality (read from
 * `WorkoutTemplate.sportType`, the same taxonomy source every other
 * marketplace use case uses — RNF-006) must be included, or the proposal is
 * rejected with 403.
 *
 * RNF-003 — `expectedVersion` must match the assignment's CURRENT
 * `adaptationVersion` at propose time. `adaptationVersion` only changes when
 * a proposal is accepted (TM075), so two proposals racing on the same,
 * still-undecided assignment do not conflict with EACH OTHER at propose
 * time; the conflict surfaces once one of them is accepted and the other's
 * `expectedVersion` is now stale (task-list.md TM074 criterio).
 */
export class ProposePlanAdaptation {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = proposePlanAdaptationSchema.parse(raw);
    const now = this.clock();

    return this.db.$transaction(async (tx) => {
      const coach = await tx.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true, status: true } });
      if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
      if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);

      // RF-302 — ONLY an ACTIVE engagement grants anything; PENDING (or ENDED,
      // e.g. right after RevokeCoachEngagement/TM076) resolves to nothing here.
      const engagement = await tx.licenseCoachEngagement.findFirst({
        where: { licenseId: input.licenseId, coachId: coach.id, status: LicenseCoachEngagementStatus.ACTIVE },
        select: { id: true, scope: true, license: { select: { status: true } } },
      });
      if (!engagement) {
        throw new SchoolError("FORBIDDEN", "Você não tem acompanhamento ativo nesta licença.", 403);
      }
      if (engagement.license.status !== TrainingLicenseStatus.ACTIVE) {
        throw new SchoolError("LICENSE_NOT_ACTIVE", "Licença não está ativa.", 409);
      }

      const assignment = await tx.workoutAssignment.findUnique({
        where: { id: input.workoutAssignmentId },
        select: {
          id: true, trainingLicenseId: true, scheduledAt: true, dueAt: true, workoutTemplateId: true, adaptationVersion: true,
          workoutTemplate: { select: { sportType: true } },
        },
      });
      // Same license the ACTIVE engagement covers — the isolation boundary
      // that keeps this from ever touching another buyer's instance (RF-303).
      if (!assignment || assignment.trainingLicenseId !== input.licenseId) {
        throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Sessão não encontrada nesta licença.", 404);
      }

      const scope = licenseCoachEngagementScopeSchema.parse(engagement.scope);
      const sportType = assignment.workoutTemplate?.sportType ?? null;
      if (sportType && !scopeIncludesSportType(scope, sportType)) {
        throw new SchoolError("FORBIDDEN", "Este professor não tem escopo para ajustar sessões desta modalidade.", 403);
      }

      if (input.expectedVersion !== assignment.adaptationVersion) {
        throw new SchoolError("ADAPTATION_VERSION_CONFLICT", "A sessão foi alterada por outra proposta. Recarregue e tente novamente.", 409);
      }

      const beforeSnapshot = {
        scheduledAt: assignment.scheduledAt?.toISOString() ?? null,
        dueAt: assignment.dueAt?.toISOString() ?? null,
        workoutTemplateId: assignment.workoutTemplateId,
      };
      const proposedSnapshot = {
        scheduledAt: input.proposedChange.scheduledAt ? input.proposedChange.scheduledAt.toISOString() : beforeSnapshot.scheduledAt,
        dueAt: input.proposedChange.dueAt !== undefined
          ? (input.proposedChange.dueAt ? input.proposedChange.dueAt.toISOString() : null)
          : beforeSnapshot.dueAt,
        workoutTemplateId: input.proposedChange.workoutTemplateId ?? beforeSnapshot.workoutTemplateId,
      };

      const created = await tx.planAdaptation.create({
        data: {
          id: randomUUID(),
          licenseId: input.licenseId,
          workoutAssignmentId: input.workoutAssignmentId,
          coachId: coach.id,
          actorUserId: actor.data,
          beforeSnapshot,
          proposedSnapshot,
          reason: input.reason,
          status: "PENDING",
          expectedVersion: input.expectedVersion,
          createdAt: now,
          updatedAt: now,
        },
      });

      schoolMetrics.marketplaceAdaptationProposed({
        licenseId: input.licenseId, adaptationId: created.id, workoutAssignmentId: input.workoutAssignmentId, coachId: coach.id,
      });

      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
