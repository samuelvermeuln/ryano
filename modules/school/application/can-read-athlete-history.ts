import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";
import { CheckHistoryAccess, checkHistoryAccessSchema } from "./check-history-access";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const athleteHistoryContextSchema = checkHistoryAccessSchema
  .pick({ athleteId: true, category: true, occurredAt: true }).extend({ schoolId: opaqueId.nullable() });
type HistoryPolicyDb = Pick<PrismaClient, "school" | "schoolMembership" | "schoolMembershipRole"
  | "coachProfile" | "coachAthleteAssignment" | "historyAccessGrant">;

/** Resolves recipient authority from the session before consulting explicit historical consent.
 * Call within the protected data query's transaction to share its authorization snapshot.
 */
export class CanReadAthleteHistory {
  constructor(private readonly db: HistoryPolicyDb, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown): Promise<boolean> {
    const actor = opaqueId.safeParse(actorUserId);
    const parsed = athleteHistoryContextSchema.safeParse(raw);
    if (!actor.success || !parsed.success) return false;
    const { athleteId, category, occurredAt, schoolId } = parsed.data;
    if (actor.data === athleteId) return true;

    if (schoolId !== null) {
      const school = await this.db.school.findUnique({ where: { id: schoolId }, select: { id: true, status: true } });
      if (!school || school.status !== "ACTIVE") return false;
      const manager = await new CanManageSchool(new SchoolMembershipRepository(this.db)).execute(actor.data, schoolId);
      if (!manager) {
        const now = z.date().parse(this.clock());
        const assignment = await this.db.coachAthleteAssignment.findFirst({
          where: {
            athleteId, schoolId, status: "ACTIVE", endedAt: null, startedAt: { lte: now },
            coach: { userId: actor.data, status: "ACTIVE", schoolMemberships: { some: {
              schoolId, status: "ACTIVE", endedAt: null, startedAt: { lte: now },
            } } },
          },
          select: { id: true },
        });
        if (!assignment) return false;
      }
      return new CheckHistoryAccess(this.db).execute({
        athleteId, category, occurredAt, granteeType: "SCHOOL", granteeId: schoolId,
      });
    }

    const coach = await this.db.coachProfile.findUnique({
      where: { userId: actor.data }, select: { id: true, userId: true, status: true },
    });
    if (!coach || coach.userId !== actor.data || coach.status !== "ACTIVE") return false;
    return new CheckHistoryAccess(this.db).execute({
      athleteId, category, occurredAt, granteeType: "COACH", granteeId: coach.id,
    });
  }

  async assert(actorUserId: string | null, raw: unknown): Promise<void> {
    if (!opaqueId.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!await this.execute(actorUserId, raw)) {
      throw new SchoolError("FORBIDDEN", "Você não pode consultar o histórico deste atleta.", 403);
    }
  }
}
