/**
 * TM020 — UpdateTrainingProductDraft.
 *
 * Cobre: edição pelo dono (coach independente e escola), 403 para produto de
 * outro autor, 409 para `expectedVersion` obsoleto (RNF-003), e a checagem de
 * consistência priceCents/currency.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { UpdateTrainingProductDraft } from "@/modules/school/application/update-training-product-draft";

const now = new Date("2026-09-23T12:00:00Z");
const stored = (over: Record<string, unknown> = {}) => ({
  id: "prod-1", schoolId: null, coachId: "coach-1", title: "Base", description: null,
  sportType: "running", durationWeeks: 12, status: "DRAFT", visibility: "PUBLIC",
  priceCents: null, currency: null, currentVersionId: null,
  slug: null, coverMediaId: null, objective: null, difficulty: null, goalType: null,
  targetEventType: null, targetDistance: null, sessionsPerWeek: null, sessionDurationMin: null,
  sessionDurationMax: null, weeklyMinutesMin: null, weeklyMinutesMax: null, sessionCount: null,
  equipment: null, language: null, availability: null, sellerPolicyVersion: null, previewVersionId: null,
  createdAt: new Date("2026-09-20T12:00:00Z"), updatedAt: new Date("2026-09-22T12:00:00Z"),
  ...over,
});

function setup(options: {
  product?: ReturnType<typeof stored>;
  coachProfile?: { id: string; status: string } | null;
  membership?: { id: string; schoolId: string; userId: string; status: string; endedAt: null } | null;
  roles?: Array<{ membershipId: string; role: string }>;
} = {}) {
  const product = options.product ?? stored();
  const tx = {
    coachProfile: {
      findUnique: vi.fn().mockResolvedValue("coachProfile" in options ? options.coachProfile : { id: "coach-1", status: "ACTIVE" }),
    },
    school: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(options.membership ?? null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue(options.roles ?? []) },
    trainingProduct: {
      findUnique: vi.fn().mockResolvedValue(product),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...product, ...data })),
    },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) };
  return { tx, db, product, useCase: new UpdateTrainingProductDraft(db as unknown as PrismaClient, () => now) };
}

describe("UpdateTrainingProductDraft [TM020]", () => {
  it("dono (coach independente) edita título e sportType", async () => {
    const { useCase, tx, product } = setup();
    const updated = await useCase.execute("user-1", {
      productId: "prod-1", expectedVersion: product.updatedAt.toISOString(), title: "Base v2",
    });
    expect(updated).toMatchObject({ title: "Base v2" });
    expect(tx.trainingProduct.update).toHaveBeenCalledWith({
      where: { id: "prod-1", updatedAt: expect.any(Date) },
      data: expect.objectContaining({ title: "Base v2", updatedAt: now }),
    });
  });

  it("OWNER/ADMIN da escola edita produto da escola", async () => {
    const schoolProduct = stored({ schoolId: "school-1", coachId: null });
    const { useCase, product } = setup({
      product: schoolProduct,
      membership: { id: "m-1", schoolId: "school-1", userId: "user-1", status: "ACTIVE", endedAt: null },
      roles: [{ membershipId: "m-1", role: "ADMIN" }],
    });
    const updated = await useCase.execute("user-1", {
      productId: "prod-1", expectedVersion: product.updatedAt.toISOString(), title: "Escola v2",
    });
    expect(updated).toMatchObject({ title: "Escola v2" });
  });

  it("rejeita coach sem OWNER/ADMIN editando produto da escola", async () => {
    const schoolProduct = stored({ schoolId: "school-1", coachId: null });
    const { useCase, product, tx } = setup({ product: schoolProduct });
    await expect(useCase.execute("user-1", { productId: "prod-1", expectedVersion: product.updatedAt.toISOString(), title: "X" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(tx.trainingProduct.update).not.toHaveBeenCalled();
  });

  it("rejeita edição de produto de outro coach (403)", async () => {
    const otherProduct = stored({ coachId: "coach-2" });
    const { useCase, tx, product } = setup({ product: otherProduct });
    await expect(useCase.execute("user-1", { productId: "prod-1", expectedVersion: product.updatedAt.toISOString(), title: "Invasão" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(tx.trainingProduct.update).not.toHaveBeenCalled();
  });

  it("rejeita produto inexistente (404)", async () => {
    const { useCase, tx } = setup();
    tx.trainingProduct.findUnique.mockResolvedValue(null);
    await expect(useCase.execute("user-1", { productId: "prod-x", expectedVersion: now.toISOString(), title: "X" }))
      .rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND", status: 404 });
  });

  it("expectedVersion obsoleto retorna 409 (RNF-003)", async () => {
    const { useCase, tx, product } = setup();
    tx.trainingProduct.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2025", clientVersion: "test" }),
    );
    await expect(useCase.execute("user-1", { productId: "prod-1", expectedVersion: product.updatedAt.toISOString(), title: "Nova" }))
      .rejects.toMatchObject({ code: "PRODUCT_UPDATE_CONFLICT", status: 409 });
  });

  it("rejeita priceCents sem currency", async () => {
    const { useCase, tx, product } = setup();
    await expect(useCase.execute("user-1", {
      productId: "prod-1", expectedVersion: product.updatedAt.toISOString(), priceCents: 4990,
    })).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
    expect(tx.trainingProduct.update).not.toHaveBeenCalled();
  });

  it("aceita priceCents + currency consistentes", async () => {
    const { useCase, tx, product } = setup();
    await useCase.execute("user-1", {
      productId: "prod-1", expectedVersion: product.updatedAt.toISOString(), priceCents: 4990, currency: "BRL",
    });
    expect(tx.trainingProduct.update).toHaveBeenCalled();
  });

  it("rejeita ator sem CoachProfile", async () => {
    const { useCase, product } = setup({ coachProfile: null });
    await expect(useCase.execute("user-1", { productId: "prod-1", expectedVersion: product.updatedAt.toISOString(), title: "X" }))
      .rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND" });
  });

  it("rejeita coach inativo", async () => {
    const { useCase, product } = setup({ coachProfile: { id: "coach-1", status: "SUSPENDED" } });
    await expect(useCase.execute("user-1", { productId: "prod-1", expectedVersion: product.updatedAt.toISOString(), title: "X" }))
      .rejects.toMatchObject({ code: "COACH_INACTIVE" });
  });
});
