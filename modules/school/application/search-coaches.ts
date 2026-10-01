import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

export const searchCoachesSchema = z.strictObject({
  q: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(100).default(20),
});

/** One row of the athlete-facing coach discovery list (SAM-25). */
export interface CoachSearchResult {
  id: string;
  displayName: string;
  bio: string | null;
  image: string | null;
  schools: Array<{ id: string; name: string }>;
  activeAthleteCount: number;
}

/**
 * Discovery of ACTIVE coaches by display name (contains) or by the exact
 * e-mail of their account (case-insensitive). The e-mail is only a lookup key:
 * the result never carries it, nor any phone, so a match confirms the person
 * the athlete already knows without exposing contact data to anyone else.
 */
export class SearchCoaches {
  constructor(private readonly db: Pick<PrismaClient, "coachProfile">) {}

  async execute(raw: unknown): Promise<{ items: CoachSearchResult[] }> {
    const { q, limit } = searchCoachesSchema.parse(raw);
    const rows = await this.db.coachProfile.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { user: { email: { equals: q.toLowerCase(), mode: "insensitive" } } },
        ],
      },
      select: {
        id: true,
        displayName: true,
        bio: true,
        user: { select: { image: true } },
        schoolMemberships: {
          where: { status: "ACTIVE", endedAt: null, suspendedAt: null, school: { status: "ACTIVE" } },
          select: { school: { select: { id: true, name: true } } },
          take: 5,
        },
        _count: { select: { athleteAssignments: { where: { status: "ACTIVE" } } } },
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: limit,
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        bio: row.bio,
        image: row.user.image,
        schools: row.schoolMemberships.map((link) => ({ id: link.school.id, name: link.school.name })),
        activeAthleteCount: row._count.athleteAssignments,
      })),
    };
  }
}
