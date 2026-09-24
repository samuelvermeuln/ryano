import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { TrainingLicenseStatus, LicenseCoachEngagementStatus } from "../domain/enums";
import { licenseCoachEngagementScopeSchema, scopesConflict } from "../domain/license-coach-scope";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const inviteCoachToLicenseSchema = z.strictObject({
  licenseId: id,
  /** The target `CoachProfile.id` — NOT necessarily the product's author (RF-301, design D-05). */
  coachId: id,
  scope: licenseCoachEngagementScopeSchema,
  /** Optional — the school context the coach was invited through, for reporting only. Grants no authorization by itself. */
  schoolId: id.optional(),
});
export type InviteCoachToLicenseInput = z.infer<typeof inviteCoachToLicenseSchema>;

/**
 * TM072 (RF-301) — the athlete who owns a license invites ANOTHER coach (not
 * necessarily the product's author) to follow this specific instance.
 * Creates a `LicenseCoachEngagement` in `PENDING` — pending never grants any
 * read/write access; only `AcceptCoachInvitation` (TM073) moves it to
 * `ACTIVE`, and every other Onda 3 use case (TM074/TM083) requires `ACTIVE`
 * explicitly, never `PENDING`.
 *
 * NO biometric/history grant is implied — `LicenseCoachEngagement` is
 * deliberately NOT a `HistoryAccessGrant` (design D-05); a coach who also
 * wants pre-license history needs a separate, explicit grant.
 *
 * RF-305 (multimodal precedence, TM085): a new invite whose scope conflicts
 * with an existing open (PENDING/ACTIVE) engagement on the SAME license is
 * rejected outright — `scopesConflict` treats "full" as conflicting with
 * anything, and two partial scopes as conflicting only when their sport
 * types overlap, so e.g. a swim-only coach and a run-only coach can coexist.
 */
export class InviteCoachToLicense {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = inviteCoachToLicenseSchema.parse(raw);
    const now = this.clock();

    try {
      return await this.db.$transaction(async (tx) => {
        const license = await tx.trainingLicense.findUnique({
          where: { id: input.licenseId },
          select: { id: true, athleteId: true, status: true },
        });
        // RNF-001 — a licenseId belonging to another athlete 404s exactly like a nonexistent one.
        if (!license || license.athleteId !== actor.data) {
          throw new SchoolError("LICENSE_NOT_FOUND", "Licença não encontrada.", 404);
        }
        if (license.status !== TrainingLicenseStatus.ACTIVE) {
          throw new SchoolError("LICENSE_NOT_ACTIVE", "Licença não está ativa.", 409);
        }

        const coach = await tx.coachProfile.findUnique({
          where: { id: input.coachId },
          select: { id: true, status: true, userId: true },
        });
        if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Professor não encontrado.", 404);
        if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);
        if (coach.userId === actor.data) {
          throw new SchoolError("ENGAGEMENT_INVALID_TARGET", "Você não pode se convidar como professor acompanhante.", 422);
        }

        if (input.schoolId) {
          const school = await tx.school.findUnique({ where: { id: input.schoolId }, select: { id: true, status: true } });
          if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
          if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
        }

        // RF-305 — reject only cross-coach scope conflicts; a duplicate
        // invite to the SAME coach is instead caught by the partial unique
        // index below (migration 0041) and reported as ENGAGEMENT_ALREADY_ACTIVE.
        const openEngagements = await tx.licenseCoachEngagement.findMany({
          where: { licenseId: license.id, status: { in: [LicenseCoachEngagementStatus.PENDING, LicenseCoachEngagementStatus.ACTIVE] } },
          select: { coachId: true, scope: true },
        });
        for (const existing of openEngagements) {
          if (existing.coachId === input.coachId) continue;
          const existingScope = licenseCoachEngagementScopeSchema.parse(existing.scope);
          if (scopesConflict(existingScope, input.scope)) {
            throw new SchoolError("ENGAGEMENT_SCOPE_CONFLICT", "Já existe um professor acompanhante com escopo conflitante nesta licença.", 409);
          }
        }

        return tx.licenseCoachEngagement.create({
          data: {
            id: randomUUID(),
            licenseId: license.id,
            athleteId: actor.data,
            coachId: input.coachId,
            schoolId: input.schoolId ?? null,
            scope: input.scope,
            status: LicenseCoachEngagementStatus.PENDING,
            requestedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new SchoolError("ENGAGEMENT_ALREADY_ACTIVE", "Já existe um convite pendente ou ativo para este professor nesta licença.", 409);
      }
      throw error;
    }
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2002";
}
