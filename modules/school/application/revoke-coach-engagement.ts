import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { LicenseCoachEngagementStatus } from "../domain/enums";
import { schoolMetrics } from "../infrastructure/metrics";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const revokeCoachEngagementSchema = z.strictObject({
  licenseId: id,
  /** Disambiguates which engagement to end when more than one coach is actively following this license (RF-305). Omit when there is exactly one open engagement. */
  coachId: id.optional(),
});
export type RevokeCoachEngagementInput = z.infer<typeof revokeCoachEngagementSchema>;

const END_REASON = "Revogado pelo atleta.";

/**
 * TM076 (RF-304) — ONLY the athlete who owns the license may revoke.
 * Flips the open (PENDING or ACTIVE) engagement(s) to `ENDED` — this is the
 * ONLY server-side gate every other Onda 3 use case checks
 * (`ProposePlanAdaptation`/TM074 requires `status: ACTIVE`), so the coach's
 * very next API call fails immediately, not just the UI losing a button
 * (task-list.md criterio).
 *
 * Preserves history: NEVER deletes the `LicenseCoachEngagement` row or any
 * `PlanAdaptation` already created/accepted under it — authorship of past
 * adjustments (`WorkoutAssignment.adjustedByCoachId`/`effectiveRevisionId`)
 * is untouched (RF-304, design D-07's "revogar não apaga execuções nem a
 * licença em si" applied to coach follow-up).
 */
export class RevokeCoachEngagement {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorAthleteId: string | null, raw: unknown) {
    const actor = id.safeParse(actorAthleteId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = revokeCoachEngagementSchema.parse(raw);
    const now = this.clock();

    return this.db.$transaction(async (tx) => {
      const license = await tx.trainingLicense.findUnique({
        where: { id: input.licenseId },
        select: { id: true, athleteId: true },
      });
      // RNF-001 — a licenseId belonging to another athlete 404s exactly like a nonexistent one.
      if (!license || license.athleteId !== actor.data) {
        throw new SchoolError("LICENSE_NOT_FOUND", "Licença não encontrada.", 404);
      }

      const openEngagements = await tx.licenseCoachEngagement.findMany({
        where: {
          licenseId: license.id,
          status: { in: [LicenseCoachEngagementStatus.PENDING, LicenseCoachEngagementStatus.ACTIVE] },
          ...(input.coachId ? { coachId: input.coachId } : {}),
        },
        select: { id: true, coachId: true },
      });
      if (openEngagements.length === 0) {
        throw new SchoolError("ENGAGEMENT_NOT_FOUND", "Nenhum acompanhamento ativo para revogar.", 404);
      }
      if (!input.coachId && openEngagements.length > 1) {
        throw new SchoolError("INVALID_INPUT", "Mais de um professor acompanhante ativo nesta licença — informe coachId.", 422);
      }

      await tx.licenseCoachEngagement.updateMany({
        where: { id: { in: openEngagements.map((e) => e.id) } },
        data: { status: LicenseCoachEngagementStatus.ENDED, endedAt: now, endReason: END_REASON, updatedAt: now },
      });

      for (const engagement of openEngagements) {
        schoolMetrics.marketplaceEngagementRevoked({
          licenseId: license.id, engagementId: engagement.id, coachId: engagement.coachId,
        });
      }

      return { revokedEngagementIds: openEngagements.map((e) => e.id) };
    });
  }
}
