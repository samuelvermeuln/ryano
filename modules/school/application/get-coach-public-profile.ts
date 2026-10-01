import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

/** What a signed-in athlete sees before asking a coach to follow them (SAM-25). */
export interface CoachPublicProfile {
  id: string;
  displayName: string;
  bio: string | null;
  image: string | null;
  /** When the coach profile was created on Ryvano — "desde". */
  since: Date;
  /** Schools where the coach is ACTIVE and not suspended. */
  schools: Array<{ id: string; name: string; city: string | null; state: string | null }>;
  activeAthleteCount: number;
  viewer: {
    /** The viewer's open (PENDING/ACTIVE) assignments with this coach, any scope. */
    assignments: Array<{ id: string; schoolId: string | null; status: "PENDING" | "ACTIVE"; requestedAt: Date }>;
    /** Schools where BOTH the viewer (ACTIVE athlete) and the coach are active — the possible scoped requests. */
    sharedSchoolIds: string[];
    /** Whether the viewer is the coach themself; a coach cannot request to be coached by themself. */
    isSelf: boolean;
  };
}

/**
 * Public profile of an ACTIVE coach for an authenticated viewer.
 *
 * Exposes what helps an athlete choose (bio, schools, how many athletes, how
 * long on the platform) and the viewer's own relationship, so the UI can offer
 * "Solicitar", "Aguardando resposta" or "Seu professor" without a second call.
 * Never exposes the coach's e-mail, phone, address or other athletes.
 */
export class GetCoachPublicProfile {
  constructor(
    private readonly db: Pick<PrismaClient, "coachProfile" | "coachAthleteAssignment" | "schoolAthleteMembership">,
  ) {}

  async execute(actorUserId: string | null, coachId: string): Promise<CoachPublicProfile> {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const target = id.safeParse(coachId);
    if (!target.success) throw this.notFound();

    const coach = await this.db.coachProfile.findUnique({
      where: { id: target.data },
      select: {
        id: true, userId: true, displayName: true, bio: true, status: true, createdAt: true,
        user: { select: { image: true } },
        schoolMemberships: {
          where: { status: "ACTIVE", endedAt: null, suspendedAt: null, school: { status: "ACTIVE" } },
          select: { school: { select: { id: true, name: true, city: true, state: true } } },
          orderBy: { startedAt: "asc" },
          take: 20,
        },
      },
    });
    if (!coach || coach.status !== "ACTIVE") throw this.notFound();

    const coachSchoolIds = coach.schoolMemberships.map((link) => link.school.id);
    const [activeAthleteCount, viewerAssignments, viewerSchoolMemberships] = await Promise.all([
      this.db.coachAthleteAssignment.count({ where: { coachId: coach.id, status: "ACTIVE" } }),
      this.db.coachAthleteAssignment.findMany({
        where: { coachId: coach.id, athleteId: actor.data, status: { in: ["PENDING", "ACTIVE"] } },
        select: { id: true, schoolId: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      coachSchoolIds.length > 0
        ? this.db.schoolAthleteMembership.findMany({
            where: { athleteId: actor.data, status: "ACTIVE", schoolId: { in: coachSchoolIds } },
            select: { schoolId: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      id: coach.id,
      displayName: coach.displayName,
      bio: coach.bio,
      image: coach.user.image,
      since: coach.createdAt,
      schools: coach.schoolMemberships.map((link) => link.school),
      activeAthleteCount,
      viewer: {
        assignments: viewerAssignments.map((assignment) => ({
          id: assignment.id,
          schoolId: assignment.schoolId,
          status: assignment.status === "ACTIVE" ? "ACTIVE" : "PENDING",
          requestedAt: assignment.createdAt,
        })),
        sharedSchoolIds: viewerSchoolMemberships.map((membership) => membership.schoolId),
        isSelf: coach.userId === actor.data,
      },
    };
  }

  private notFound() {
    return new SchoolError("COACH_PROFILE_NOT_FOUND", "Professor não encontrado.", 404);
  }
}
