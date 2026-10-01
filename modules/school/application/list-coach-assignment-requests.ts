import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

/** One pending request as the coach sees it (SAM-26). */
export interface CoachAssignmentRequestView {
  id: string;
  schoolId: string | null;
  schoolName: string | null;
  athlete: { id: string; name: string | null; email: string; image: string | null };
  /** What the athlete wrote when asking. */
  note: string | null;
  requestedAt: Date;
  /** False while a school-scoped request waits for the school to approve the athlete. */
  canAccept: boolean;
  blockedReason: string | null;
}

/**
 * Pending requests addressed to the session coach. `schoolId` narrows the list:
 * omitted = everything, `null` = independent only, a string = that school.
 * A user without a coach profile simply has no requests.
 */
export class ListCoachAssignmentRequests {
  constructor(private readonly db: Pick<PrismaClient, "coachProfile" | "coachAthleteAssignment" | "schoolAthleteMembership">) {}

  async execute(actorUserId: string | null, options: { schoolId?: string | null } = {}): Promise<CoachAssignmentRequestView[]> {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) return [];
    const coach = await this.db.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true } });
    if (!coach) return [];

    const rows = await this.db.coachAthleteAssignment.findMany({
      where: {
        coachId: coach.id,
        status: "PENDING",
        ...(options.schoolId === undefined ? {} : { schoolId: options.schoolId }),
      },
      select: {
        id: true, schoolId: true, athleteId: true, reason: true, createdAt: true,
        athlete: { select: { id: true, name: true, email: true, image: true } },
        school: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const scoped = rows.filter((row): row is typeof row & { schoolId: string } => row.schoolId !== null);
    const activeMemberships = scoped.length === 0
      ? []
      : await this.db.schoolAthleteMembership.findMany({
          where: { status: "ACTIVE", OR: scoped.map((row) => ({ athleteId: row.athleteId, schoolId: row.schoolId })) },
          select: { athleteId: true, schoolId: true },
        });
    const activeKeys = new Set(activeMemberships.map((membership) => `${membership.schoolId}:${membership.athleteId}`));

    return rows.map((row) => {
      const canAccept = row.schoolId === null || activeKeys.has(`${row.schoolId}:${row.athleteId}`);
      return {
        id: row.id,
        schoolId: row.schoolId,
        schoolName: row.school?.name ?? null,
        athlete: row.athlete,
        note: row.reason,
        requestedAt: row.createdAt,
        canAccept,
        blockedReason: canAccept ? null : "Aguardando a escola aprovar o vínculo do atleta.",
      };
    });
  }
}
