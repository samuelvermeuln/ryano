import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AssignmentStatus, MembershipStatus, SchoolRole } from "@/modules/school/domain/enums";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

/** Authorizes current school-context data; historical access remains grant-based. */
export class CanReadAthleteCurrentData {
  constructor(private readonly db: Pick<PrismaClient, "schoolMembership" | "coachProfile" | "coachAthleteAssignment">) {}

  async execute(actorUserId: string | null, athleteId: string, schoolId: string): Promise<boolean> {
    const actor = idSchema.safeParse(actorUserId);
    const athlete = idSchema.safeParse(athleteId);
    const school = idSchema.safeParse(schoolId);
    if (!actor.success || !athlete.success || !school.success) return false;
    if (actor.data === athlete.data) return true;

    const membership = await this.db.schoolMembership.findFirst({
      where: {
        schoolId: school.data,
        userId: actor.data,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
        roles: { some: { role: { in: [SchoolRole.OWNER, SchoolRole.ADMIN] } } },
      },
      select: { id: true },
    });
    if (membership) return true;

    const assignment = await this.db.coachAthleteAssignment.findFirst({
      where: {
        athleteId: athlete.data,
        schoolId: school.data,
        status: AssignmentStatus.ACTIVE,
        endedAt: null,
        coach: { userId: actor.data, status: "ACTIVE" },
      },
      select: { id: true },
    });
    return assignment !== null;
  }
}
