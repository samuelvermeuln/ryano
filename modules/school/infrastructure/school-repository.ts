import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { CoachSelectionPolicy, SchoolJoinPolicy } from "../domain/enums";
import type { School } from "../domain/school";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const updateSchoolDtoSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: z.string().max(5000).nullable().optional(),
  logoUrl: z.url().nullable().optional(),
  joinPolicy: z.enum(SchoolJoinPolicy).optional(),
  coachSelectionPolicy: z.enum(CoachSelectionPolicy).optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), "Informe ao menos um campo para atualizar.");
const pageSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2048).optional(),
});
const cursorSchema = z.strictObject({ name: z.string().min(1).max(200), id: idSchema });

export type UpdateSchoolData = z.infer<typeof updateSchoolDtoSchema>;
/** `_count` is optional so callers that feed plain `School` rows (tests, fixtures) still type-check. */
export type SchoolSearchRow = School & { _count?: { athleteMemberships: number } };

export class SchoolRepository {
  constructor(private readonly db: Pick<PrismaClient, "school">) {}

  create(school: Omit<School, "id"> & { id?: string }): Promise<School> {
    return this.db.school.create({ data: school });
  }

  findById(id: string): Promise<School | null> {
    return this.db.school.findUnique({ where: { id: idSchema.parse(id) } });
  }

  findBySlug(slug: string): Promise<School | null> {
    return this.db.school.findUnique({ where: { slug } });
  }

  async update(id: string, data: UpdateSchoolData, now: Date): Promise<School> {
    return this.db.school.update({
      where: { id: idSchema.parse(id) },
      data: { ...updateSchoolDtoSchema.parse(data), updatedAt: z.date().parse(now) },
    });
  }

  async deactivate(id: string, now: Date): Promise<School> {
    idSchema.parse(id);
    z.date().parse(now);
    await this.db.school.updateMany({
      where: { id, status: "ACTIVE" },
      data: { status: "INACTIVE", deactivatedAt: now, updatedAt: now },
    });
    return this.db.school.findUniqueOrThrow({ where: { id } });
  }

  async reactivate(id: string, now: Date): Promise<School> {
    idSchema.parse(id);
    z.date().parse(now);
    await this.db.school.updateMany({
      where: { id, status: "INACTIVE" },
      data: { status: "ACTIVE", deactivatedAt: null, updatedAt: now },
    });
    return this.db.school.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Public discovery (SAM-24): matches the text against the school name OR its
   * city, and brings the ACTIVE athlete count the cards display. The method
   * keeps its name because the contract (text in, page out) is unchanged.
   */
  async searchByName(query: string, options: { limit?: number; cursor?: string } = {}) {
    const text = z.string().trim().max(200).parse(query);
    const { limit, cursor } = pageSchema.parse(options);
    const after = cursor ? cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))) : null;
    // Both sort keys travel in the cursor; equal school names cannot skip rows.
    // The text match and the cursor are separate OR groups, so they go in AND.
    const rows = await this.db.school.findMany({
      where: {
        status: "ACTIVE",
        AND: [
          { OR: [{ name: { contains: text, mode: "insensitive" } }, { city: { contains: text, mode: "insensitive" } }] },
          ...(after ? [{ OR: [{ name: { gt: after.name } }, { name: after.name, id: { gt: after.id } }] }] : []),
        ],
      },
      include: { _count: { select: { athleteMemberships: { where: { status: "ACTIVE" } } } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    const items: SchoolSearchRow[] = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > limit && last
        ? Buffer.from(JSON.stringify({ name: last.name, id: last.id })).toString("base64url")
        : null,
    };
  }
}
