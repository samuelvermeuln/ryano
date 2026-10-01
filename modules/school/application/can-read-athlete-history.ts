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

  /**
   * SAM-20 — the same decision as `execute`, resolved once for many dates: the
   * recipient's authority is checked once, the athlete's active grants for the
   * category are loaded once, and each date is then answered in memory. Replaces
   * one `execute` per timeline entry (3–5 queries each) with a bounded number of
   * queries per screen. Semantics are identical to `execute`.
   */
  async resolver(
    actorUserId: string | null,
    raw: { athleteId: string; schoolId: string | null; category: string },
  ): Promise<(occurredAt: Date) => boolean> {
    const actor = opaqueId.safeParse(actorUserId);
    const parsed = athleteHistoryContextSchema.omit({ occurredAt: true }).safeParse(raw);
    if (!actor.success || !parsed.success) return () => false;
    const { athleteId, category, schoolId } = parsed.data;
    if (actor.data === athleteId) return () => true;

    let granteeType: "SCHOOL" | "COACH";
    let granteeId: string;
    if (schoolId !== null) {
      const school = await this.db.school.findUnique({ where: { id: schoolId }, select: { id: true, status: true } });
      if (!school || school.status !== "ACTIVE") return () => false;
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
        if (!assignment) return () => false;
      }
      granteeType = "SCHOOL";
      granteeId = schoolId;
    } else {
      const coach = await this.db.coachProfile.findUnique({
        where: { userId: actor.data }, select: { id: true, userId: true, status: true },
      });
      if (!coach || coach.userId !== actor.data || coach.status !== "ACTIVE") return () => false;
      granteeType = "COACH";
      granteeId = coach.id;
    }

    // Same predicate as `CheckHistoryAccess`, minus the date bounds, which are
    // applied per entry below (inclusive UTC calendar days).
    const grants = await this.db.historyAccessGrant.findMany({
      where: {
        athleteId, grantedBy: athleteId, granteeType, granteeId,
        schoolId: granteeType === "SCHOOL" ? granteeId : null,
        coachId: granteeType === "COACH" ? granteeId : null,
        status: "ACTIVE", revokedBy: null, revokedAt: null,
        scope: { path: [category], equals: true },
      },
      select: { fromDate: true, toDate: true },
    });
    return (occurredAt: Date) => {
      const day = new Date(occurredAt);
      day.setUTCHours(0, 0, 0, 0);
      return grants.some((grant) =>
        (grant.fromDate === null || grant.fromDate <= day) && (grant.toDate === null || grant.toDate >= day));
    };
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
