import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const currentAthleteDataContextSchema = z.strictObject({ athleteId: opaqueId, schoolId: opaqueId.nullable() });
type CurrentDataDb = Pick<PrismaClient, "school" | "schoolAthleteMembership" | "schoolMembership"
  | "schoolMembershipRole" | "coachAthleteAssignment">;

/** Operational access only; never use this decision to authorize past periods.
 * Pass the data query's transaction client when a consistent authorization snapshot is required.
 */
export class CanReadAthleteCurrentData {
  constructor(private readonly db: CurrentDataDb, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown): Promise<boolean> {
    const actor = opaqueId.safeParse(actorUserId);
    const context = currentAthleteDataContextSchema.safeParse(raw);
    if (!actor.success || !context.success) return false;
    const { athleteId, schoolId } = context.data;
    if (actor.data === athleteId) return true;
    const now = z.date().parse(this.clock());

    if (schoolId !== null) {
      const school = await this.db.school.findUnique({ where: { id: schoolId }, select: { id: true, status: true } });
      if (!school || school.status !== "ACTIVE") return false;
      const membership = await this.db.schoolAthleteMembership.findFirst({
        where: { athleteId, schoolId, status: "ACTIVE", endedAt: null, startedAt: { lte: now } }, select: { id: true },
      });
      if (!membership) return false;
      if (await new CanManageSchool(new SchoolMembershipRepository(this.db)).execute(actor.data, schoolId)) return true;
    }

    const assignment = await this.db.coachAthleteAssignment.findFirst({
      where: {
        athleteId, schoolId, status: "ACTIVE", endedAt: null, startedAt: { lte: now },
        coach: {
          userId: actor.data, status: "ACTIVE",
          ...(schoolId !== null ? { schoolMemberships: { some: {
            schoolId, status: "ACTIVE", endedAt: null, startedAt: { lte: now },
          } } } : {}),
        },
      },
      select: { id: true },
    });
    return assignment !== null;
  }

  async assert(actorUserId: string | null, raw: unknown): Promise<void> {
    if (!opaqueId.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!await this.execute(actorUserId, raw)) {
      throw new SchoolError("FORBIDDEN", "Você não pode consultar os dados deste atleta.", 403);
    }
  }
}
