import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { LicenseCoachEngagementStatus, TrainingLicenseStatus } from "../domain/enums";
import { schoolMetrics } from "../infrastructure/metrics";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const acceptCoachInvitationSchema = z.strictObject({
  engagementId: id,
});
export type AcceptCoachInvitationInput = z.infer<typeof acceptCoachInvitationSchema>;

/**
 * TM073 (RF-302) — ONLY the invited coach may accept, verified by the
 * `CoachProfile` that owns the actor's own user id — never by a `coachId`
 * supplied in the body/URL (RNF-001). Moves `PENDING` -> `ACTIVE`.
 *
 * Deliberately does NOT resolve "conflict with the vigent assignment
 * policy" as a separate check beyond RF-305 (TM085) — the scope-conflict
 * gate already runs at invite time (TM072); by the time a PENDING invite
 * reaches accept, it was already the only/compatible one for its scope on
 * this license. A second acceptance attempt while it is already ACTIVE
 * reports `ENGAGEMENT_ALREADY_ACTIVE`, never a generic error.
 */
export class AcceptCoachInvitation {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = acceptCoachInvitationSchema.parse(raw);
    const now = this.clock();

    try {
      return await this.db.$transaction(async (tx) => {
        const engagement = await tx.licenseCoachEngagement.findUnique({
          where: { id: input.engagementId },
          select: { id: true, coachId: true, licenseId: true, status: true },
        });
        if (!engagement) throw new SchoolError("ENGAGEMENT_NOT_FOUND", "Convite não encontrado.", 404);

        const coach = await tx.coachProfile.findUnique({
          where: { id: engagement.coachId },
          select: { id: true, userId: true, status: true },
        });
        // Identity check — the actor must own the INVITED coach profile.
        // Not RNF-001's usual 404: task-list.md TM073 explicitly requires
        // 403 here (the invitation id is not itself sensitive existence data).
        if (!coach || coach.userId !== actor.data) {
          throw new SchoolError("FORBIDDEN", "Apenas o professor convidado pode aceitar este convite.", 403);
        }
        if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);

        if (engagement.status === LicenseCoachEngagementStatus.ACTIVE) {
          throw new SchoolError("ENGAGEMENT_ALREADY_ACTIVE", "Este convite já foi aceito.", 409);
        }
        if (engagement.status !== LicenseCoachEngagementStatus.PENDING) {
          throw new SchoolError("ENGAGEMENT_NOT_PENDING", "Este convite não está mais disponível.", 409);
        }

        const license = await tx.trainingLicense.findUnique({
          where: { id: engagement.licenseId },
          select: { status: true },
        });
        if (!license || license.status !== TrainingLicenseStatus.ACTIVE) {
          throw new SchoolError("LICENSE_NOT_ACTIVE", "A licença não está mais ativa.", 409);
        }

        const updated = await tx.licenseCoachEngagement.update({
          where: { id: engagement.id },
          data: { status: LicenseCoachEngagementStatus.ACTIVE, acceptedAt: now, updatedAt: now },
        });

        schoolMetrics.marketplaceCoachInvitationAccepted({
          licenseId: engagement.licenseId, engagementId: engagement.id, coachId: coach.id,
        });

        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        // Concurrent accept attempts serialized against each other — surface as the same duplicate-accept outcome.
        throw new SchoolError("ENGAGEMENT_ALREADY_ACTIVE", "Este convite já foi processado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
