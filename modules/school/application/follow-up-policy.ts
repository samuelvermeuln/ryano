/**
 * SAM-56 — the deadlines/reminders configuration of a school (OWNER/ADMIN)
 * or of an independent coach (§7.2, §27.2). Product options, not training
 * norms; without a row the documented defaults apply.
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { DEFAULT_FOLLOW_UP_POLICY } from "../domain/follow-up-schedule";
import { isValidTimeZone } from "../domain/local-date";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";
import { loadFollowUpPolicy } from "./follow-up-reminders";

const scopeSchema = z.union([
  z.strictObject({ kind: z.literal("school"), schoolId: z.string().min(1).max(256) }),
  z.strictObject({ kind: z.literal("coach") }),
]);

export const followUpPolicyInputSchema = z.strictObject({
  firstAnalysisBusinessDays: z.number().int().min(0).max(30),
  reminderDaysBefore: z.array(z.number().int().min(1).max(365)).max(10).transform((days) => [...new Set(days)].sort((a, b) => b - a)),
  workingDays: z.array(z.number().int().min(1).max(7)).min(1, "Escolha ao menos um dia útil.").max(7).transform((days) => [...new Set(days)].sort()),
  timeZone: z.string().refine(isValidTimeZone, "Fuso horário inválido."),
  notifyCoordinationOnOverdue: z.boolean(),
  milestoneNotifyAthlete: z.boolean(),
  milestoneNotifyCoach: z.boolean(),
  /** SAM-61 — "aguardando registro" window (sync delay), in hours. */
  syncWindowHours: z.number().int().min(1).max(336).default(48),
  /** SAM-63 — sRPE only when chosen; null = no load method. */
  sessionLoadMethod: z.enum(["SRPE"]).nullish().transform((v) => v ?? null),
});

async function resolveOwner(db: PrismaClient, actorUserId: string | null, rawScope: unknown) {
  if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
  const scope = scopeSchema.parse(rawScope);
  if (scope.kind === "school") {
    if (!await new CanManageSchool(new SchoolMembershipRepository(db)).execute(actorUserId, scope.schoolId)) {
      throw new SchoolError("FORBIDDEN", "Só a gestão da escola altera os prazos.", 403);
    }
    return { schoolId: scope.schoolId, coachId: null };
  }
  const coach = await db.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
  if (!coach) throw new SchoolError("FORBIDDEN", "Apenas professores configuram prazos.", 403);
  return { schoolId: null, coachId: coach.id };
}

export class GetFollowUpPolicy {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, rawScope: unknown) {
    const owner = await resolveOwner(this.db, actorUserId, rawScope);
    const row = owner.schoolId
      ? await this.db.followUpPolicy.findUnique({ where: { schoolId: owner.schoolId } })
      : await this.db.followUpPolicy.findUnique({ where: { coachId: owner.coachId! } });
    const values = await loadFollowUpPolicy(this.db, owner);
    return {
      ...values,
      milestoneNotifyAthlete: row?.milestoneNotifyAthlete ?? true,
      milestoneNotifyCoach: row?.milestoneNotifyCoach ?? true,
      isDefault: row === null,
      version: row?.version ?? 0,
      defaults: DEFAULT_FOLLOW_UP_POLICY,
    };
  }
}

export class SaveFollowUpPolicy {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, rawScope: unknown, raw: unknown) {
    const owner = await resolveOwner(this.db, actorUserId, rawScope);
    const input = followUpPolicyInputSchema.parse(raw);
    const where = owner.schoolId ? { schoolId: owner.schoolId } : { coachId: owner.coachId! };
    await this.db.followUpPolicy.upsert({
      where,
      create: { id: randomUUID(), ...owner, ...input, updatedByUserId: actorUserId },
      update: { ...input, updatedByUserId: actorUserId, version: { increment: 1 } },
    });
    // Reminders already scheduled are recomputed lazily on the next change of each participation;
    // the policy only shapes reminders created from now on (no retroactive flood).
    return new GetFollowUpPolicy(this.db).execute(actorUserId, rawScope);
  }
}
