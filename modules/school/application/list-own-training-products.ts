import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolRole, MembershipStatus } from "../domain/enums";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const listOwnTrainingProductsSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2048).optional(),
});
export type ListOwnTrainingProductsInput = z.infer<typeof listOwnTrainingProductsSchema>;

export interface OwnTrainingProductSummary {
  id: string;
  schoolId: string | null;
  coachId: string | null;
  title: string;
  status: string;
  visibility: string;
  priceCents: number | null;
  currency: string | null;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * TM027 — `GET /api/coach/products`: the AUTHENTICATED "my products" listing
 * that RF-001/design D-01 requires as a separate route from the public
 * catalog — it returns products in ANY status (DRAFT/PUBLISHED/ARCHIVED),
 * scoped to what the actor is actually authorized to see: products the
 * actor's own `CoachProfile` owns directly, plus products owned by any
 * school where the actor is OWNER/ADMIN (the same bar TM018's guard uses to
 * authorize creating a school product in the first place).
 */
export class ListOwnTrainingProducts {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, raw: unknown): Promise<{ items: OwnTrainingProductSummary[]; nextCursor: string | null }> {
    const { limit, cursor } = listOwnTrainingProductsSchema.parse(raw);

    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);

    const coach = await this.db.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true, status: true } });
    if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
    if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);

    const managedSchools = await this.db.schoolMembership.findMany({
      where: {
        userId: actor.data,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
        roles: { some: { role: { in: [SchoolRole.OWNER, SchoolRole.ADMIN] } } },
      },
      select: { schoolId: true },
    });
    const schoolIds = managedSchools.map((m) => m.schoolId);

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
      where: { OR: [{ coachId: coach.id }, ...(schoolIds.length > 0 ? [{ schoolId: { in: schoolIds } }] : [])] },
      take: limit + 1,
      skip: cursorFilter ? 1 : 0,
      cursor: cursorFilter,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true, schoolId: true, coachId: true, title: true, status: true, visibility: true,
        priceCents: true, currency: true, currentVersionId: true, createdAt: true, updatedAt: true,
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
