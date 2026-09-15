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

/** Public discovery; school ownership and lifecycle metadata are not exposed. */
export class SearchSchools {
  constructor(private readonly db: Pick<PrismaClient, "school">) {}

  async execute(raw: unknown) {
    const { q, limit, cursor } = searchSchoolsSchema.parse(raw);
    // The repository validates the composite cursor and enforces ACTIVE status.
    const page = await new SchoolRepository(this.db).searchByName(q, { limit, cursor });
    return {
      items: page.items.map(({ id, slug, name, description, logoUrl, joinPolicy, coachSelectionPolicy }) => ({
        id, slug, name, description, logoUrl, joinPolicy, coachSelectionPolicy,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
