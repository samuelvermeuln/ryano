/**
 * TM046 — ListSchoolMarketplaceProducts: /escola/[schoolId]/marketplace's
 * use case. Focus: OWNER/ADMIN-only authorization, school-scoping (never a
 * coach-only product from outside the school), and RF-104's "aggregate
 * only, never a buyer" discipline (no athleteId anywhere in the DTO).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ListSchoolMarketplaceProducts } from "@/modules/school/application/list-school-marketplace-products";

function makeDb(over: Record<string, unknown> = {}) {
  return {
    schoolMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: "mem-1", schoolId: "school-1", userId: "owner-1", status: "ACTIVE", endedAt: null }),
    },
    schoolMembershipRole: {
      findMany: vi.fn().mockResolvedValue([{ membershipId: "mem-1", role: "OWNER" }]),
    },
    trainingProduct: {
      findMany: vi.fn().mockResolvedValue([
        { id: "prod-1", title: "Plano A", status: "PUBLISHED", visibility: "PUBLIC", priceCents: 4990, currency: "BRL", sportType: "running", createdAt: new Date(), updatedAt: new Date(), coach: { id: "coach-1", displayName: "Coach A" } },
      ]),
    },
    trainingPurchase: {
      groupBy: vi.fn().mockResolvedValue([
        { productId: "prod-1", status: "COMPLETED", _count: { _all: 3 }, _sum: { pricePaid: 14970 } },
        { productId: "prod-1", status: "PENDING", _count: { _all: 1 }, _sum: { pricePaid: 4990 } },
      ]),
    },
    trainingLicense: {
      groupBy: vi.fn().mockResolvedValue([{ productId: "prod-1", _count: { _all: 3 } }]),
    },
    ...over,
  } as unknown as PrismaClient;
}

beforeEach(() => vi.clearAllMocks());

describe("ListSchoolMarketplaceProducts [TM046]", () => {
  it("OWNER/ADMIN vê os produtos da escola com resumo agregado de vendas", async () => {
    const db = makeDb();
    const out = await new ListSchoolMarketplaceProducts(db).execute("owner-1", { schoolId: "school-1" });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({
      id: "prod-1",
      author: { coachId: "coach-1", name: "Coach A" },
      sales: { totalPurchases: 4, completedPurchases: 3, pendingPurchases: 1, grossRevenueCents: 14970, activeLicenses: 3 },
    });
  });

  it("não-OWNER/ADMIN recebe FORBIDDEN (403)", async () => {
    const db = makeDb({
      schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    await expect(new ListSchoolMarketplaceProducts(db).execute("intruder-1", { schoolId: "school-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((db as unknown as { trainingProduct: { findMany: ReturnType<typeof vi.fn> } }).trainingProduct.findMany).not.toHaveBeenCalled();
  });

  it("membro COACH/ASSISTANT_COACH (não OWNER/ADMIN) também recebe FORBIDDEN", async () => {
    const db = makeDb({
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ membershipId: "mem-1", role: "COACH" }]) },
    });
    await expect(new ListSchoolMarketplaceProducts(db).execute("owner-1", { schoolId: "school-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("filtra sempre por schoolId do input validado — nunca lista produto de outra escola", async () => {
    const db = makeDb();
    await new ListSchoolMarketplaceProducts(db).execute("owner-1", { schoolId: "school-1" });
    expect((db as unknown as { trainingProduct: { findMany: ReturnType<typeof vi.fn> } }).trainingProduct.findMany)
      .toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ schoolId: "school-1" }) }));
  });

  it("DTO nunca inclui athleteId/comprador individual (RF-104 — só agregado)", async () => {
    const db = makeDb();
    const out = await new ListSchoolMarketplaceProducts(db).execute("owner-1", { schoolId: "school-1" });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toMatch(/athleteId/i);
  });

  it("sem sessão responde UNAUTHORIZED (401)", async () => {
    const db = makeDb();
    await expect(new ListSchoolMarketplaceProducts(db).execute(null, { schoolId: "school-1" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
