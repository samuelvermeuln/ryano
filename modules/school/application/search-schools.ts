import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolRepository } from "../infrastructure/school-repository";

export const searchSchoolsSchema = z.strictObject({
  q: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).refine((value) => {
    try {
      const decoded = Buffer.from(value, "base64url");
      JSON.parse(decoded.toString("utf8"));
      return decoded.toString("base64url") === value;
    } catch {
      return false;
    }
  }, "Cursor inválido.").optional(),
});

/** One row of the athlete-facing discovery list (SAM-24). */
export interface SchoolSearchResult {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  city: string | null;
  state: string | null;
  sportTypes: string[];
  activeAthleteCount: number;
  joinPolicy: string;
  coachSelectionPolicy: string;
}

/**
 * Public discovery by name or city; school ownership, contact and lifecycle
 * metadata are not exposed here — the profile endpoint serves those to a
 * signed-in athlete.
 */
export class SearchSchools {
  constructor(private readonly db: Pick<PrismaClient, "school">) {}

  async execute(raw: unknown): Promise<{ items: SchoolSearchResult[]; nextCursor: string | null }> {
    const { q, limit, cursor } = searchSchoolsSchema.parse(raw);
    // The repository validates the composite cursor and enforces ACTIVE status.
    const page = await new SchoolRepository(this.db).searchByName(q, { limit, cursor });
    return {
      items: page.items.map((school) => ({
        id: school.id,
        slug: school.slug,
        name: school.name,
        description: school.description,
        logoUrl: school.logoUrl,
        city: school.city,
        state: school.state,
        sportTypes: school.sportTypes,
        activeAthleteCount: school._count?.athleteMemberships ?? 0,
        joinPolicy: school.joinPolicy,
        coachSelectionPolicy: school.coachSelectionPolicy,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
