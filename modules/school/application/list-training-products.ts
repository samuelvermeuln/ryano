import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TrainingProductStatus, TrainingProductVisibility } from "../domain/enums";

/**
 * TM001 — this listing has no actor/session concept (it backs the
 * unauthenticated `publicSchoolResponse` route). `status` and `visibility`
 * are intentionally NOT accepted here: a client-supplied override was how
 * `?status=DRAFT`/`?visibility=SCHOOL_ONLY` used to leak unpublished and
 * school-only products. An authenticated "see my own drafts" listing is a
 * separate route (`GET /api/coach/products`, TM024), not a parameter on
 * this one.
 */
export const listTrainingProductsSchema = z.strictObject({
  schoolId: z.string().min(1).optional(),
  coachId: z.string().min(1).optional(),
  sportType: z.string().trim().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2048).optional(),
});

export type ListTrainingProductsInput = z.infer<typeof listTrainingProductsSchema>;

export interface TrainingProductSummary {
  id: string;
  schoolId: string | null;
  coachId: string | null;
  title: string;
  description: string | null;
  sportType: string | null;
  durationWeeks: number | null;
  status: string;
  visibility: string;
  priceCents: number | null;
  currency: string | null;
  currentVersionId: string | null;
  createdAt: Date;
}

export class ListTrainingProducts {
  constructor(private readonly db: Pick<PrismaClient, "trainingProduct">) {}

  async execute(raw: unknown): Promise<{ items: TrainingProductSummary[]; nextCursor: string | null }> {
    const { schoolId, coachId, sportType, limit, cursor } = listTrainingProductsSchema.parse(raw);

    let cursorFilter: { id: string } | undefined;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { id: string };
        cursorFilter = { id: decoded.id };
      } catch {
        cursorFilter = undefined;
      }
    }

    const rows = await this.db.trainingProduct.findMany({
      where: {
        ...(schoolId ? { schoolId } : {}),
        ...(coachId ? { coachId } : {}),
        status: TrainingProductStatus.PUBLISHED,
        visibility: TrainingProductVisibility.PUBLIC,
        ...(sportType ? { sportType } : {}),
      },
      take: limit + 1,
      skip: cursorFilter ? 1 : 0,
      cursor: cursorFilter,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true, schoolId: true, coachId: true, title: true, description: true,
        sportType: true, durationWeeks: true, status: true, visibility: true,
        priceCents: true, currency: true, currentVersionId: true, createdAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? Buffer.from(JSON.stringify({ id: lastItem.id })).toString("base64url")
      : null;

    return { items, nextCursor };
  }
}
