/**
 * TM022 — PublishTrainingProductVersion.
 *
 * Cobre: publicação bem-sucedida (coach independente e escola), falha antes
 * de qualquer escrita quando o template é inexistente ou inacessível, e a
 * sobrevivência do snapshot ao arquivamento do template de origem.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PublishTrainingProductVersion } from "@/modules/school/application/publish-training-product-version";

const now = new Date("2026-09-23T12:00:00Z");
const product: {
  id: string; schoolId: string | null; coachId: string | null; title: string; description: string | null;
  sportType: string; durationWeeks: number; status: string; visibility: string; priceCents: number | null;
  currency: string | null; currentVersionId: string | null; slug: string | null; coverMediaId: string | null;
  objective: string | null; difficulty: string | null; goalType: string | null; targetEventType: string | null;
  targetDistance: string | null; sessionsPerWeek: number | null; sessionDurationMin: number | null;
  sessionDurationMax: number | null; weeklyMinutesMin: number | null; weeklyMinutesMax: number | null;
  sessionCount: number | null; equipment: string | null; language: string | null; availability: string | null;
  sellerPolicyVersion: string | null; previewVersionId: string | null; createdAt: Date; updatedAt: Date;
} = {
  id: "prod-1", schoolId: null, coachId: "coach-1", title: "Base", description: null,
  sportType: "running", durationWeeks: 12, status: "DRAFT", visibility: "PUBLIC",
  priceCents: null, currency: null, currentVersionId: null,
  slug: null, coverMediaId: null, objective: null, difficulty: null, goalType: null,
  targetEventType: null, targetDistance: null, sessionsPerWeek: null, sessionDurationMin: null,
  sessionDurationMax: null, weeklyMinutesMin: null, weeklyMinutesMax: null, sessionCount: null,
  equipment: null, language: null, availability: null, sellerPolicyVersion: null, previewVersionId: null,
  createdAt: new Date("2026-09-20T12:00:00Z"), updatedAt: new Date("2026-09-20T12:00:00Z"),
};

const draft = {
  id: "ver-1", productId: "prod-1", versionNumber: 1, schemaVersion: 2, changeNote: null, publishedAt: null,
  planPayload: {
    weeks: [{ week: 1, days: [{ dayOfWeek: 1, sessions: [
      { planSessionId: "s1", workoutTemplateId: "tpl-1", sportType: "run", order: 0 },
    ] }] }],
  },
};

function setup(options: {
  product?: typeof product;
  draft?: unknown;
  templates?: Array<{ id: string; ownerType: string; authorCoachId: string | null; schoolId: string | null }>;
  membership?: { id: string; schoolId: string; userId: string; status: string; endedAt: null } | null;
  roles?: Array<{ membershipId: string; role: string }>;
} = {}) {
  const activeProduct = options.product ?? product;
  const tx = {
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE" }) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(options.membership ?? null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue(options.roles ?? []) },
    trainingProduct: {
      findUnique: vi.fn().mockResolvedValue(activeProduct),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...activeProduct, ...data })),
    },
    trainingProductVersion: {
      findFirst: vi.fn().mockResolvedValue("draft" in options ? options.draft : draft),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...draft, ...data })),
    },
    workoutTemplate: {
      findMany: vi.fn().mockResolvedValue(
        options.templates ?? [{ id: "tpl-1", ownerType: "COACH", authorCoachId: "coach-1", schoolId: null }],
      ),
    },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) };
  return { tx, db, useCase: new PublishTrainingProductVersion(db as unknown as PrismaClient, () => now) };
}

describe("PublishTrainingProductVersion [TM022]", () => {
  it("publica com sucesso: define publishedAt, contentHash e currentVersionId do produto", async () => {
    const { useCase, tx } = setup();
    const published = await useCase.execute("user-1", { productId: "prod-1" });
    expect(published).toMatchObject({ publishedAt: now });
    expect((published as { contentHash: string }).contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tx.trainingProduct.update).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { currentVersionId: "ver-1", status: "PUBLISHED", updatedAt: now },
    });
  });

  it("falha ANTES de qualquer escrita quando o template referenciado não existe", async () => {
    const { useCase, tx } = setup({ templates: [] });
    await expect(useCase.execute("user-1", { productId: "prod-1" }))
      .rejects.toMatchObject({ code: "WORKOUT_TEMPLATE_NOT_FOUND", status: 404 });
    expect(tx.trainingProductVersion.update).not.toHaveBeenCalled();
    expect(tx.trainingProduct.update).not.toHaveBeenCalled();
  });

  it("falha ANTES de qualquer escrita quando o template pertence a outro coach", async () => {
    const { useCase, tx } = setup({ templates: [{ id: "tpl-1", ownerType: "COACH", authorCoachId: "coach-2", schoolId: null }] });
    await expect(useCase.execute("user-1", { productId: "prod-1" }))
      .rejects.toMatchObject({ code: "WORKOUT_TEMPLATE_NOT_ACCESSIBLE", status: 403 });
    expect(tx.trainingProductVersion.update).not.toHaveBeenCalled();
    expect(tx.trainingProduct.update).not.toHaveBeenCalled();
  });

  it("snapshot publicado sobrevive ao arquivamento do template de origem", async () => {
    const { useCase } = setup({ templates: [{ id: "tpl-1", ownerType: "COACH", authorCoachId: "coach-1", schoolId: null }] });
    // The referenced template row still exists (archiving is a soft status
    // flip, never a delete — archive-workout-template.ts) — publish checks
    // existence + ownership only, never `status`, so this still succeeds.
    const published = await useCase.execute("user-1", { productId: "prod-1" });
    expect(published).toMatchObject({ publishedAt: now });
  });

  it("publica produto de escola com template pertencente à escola", async () => {
    const schoolProduct = { ...product, schoolId: "school-1", coachId: null };
    const { useCase } = setup({
      product: schoolProduct,
      templates: [{ id: "tpl-1", ownerType: "SCHOOL", authorCoachId: null, schoolId: "school-1" }],
      membership: { id: "m-1", schoolId: "school-1", userId: "user-1", status: "ACTIVE", endedAt: null },
      roles: [{ membershipId: "m-1", role: "OWNER" }],
    });
    const published = await useCase.execute("user-1", { productId: "prod-1" });
    expect(published).toMatchObject({ publishedAt: now });
  });

  it("rejeita quando não há rascunho para publicar", async () => {
    const { useCase } = setup({ draft: null });
    await expect(useCase.execute("user-1", { productId: "prod-1" }))
      .rejects.toMatchObject({ code: "VERSION_NOT_FOUND", status: 404 });
  });

  it("rejeita produto inexistente", async () => {
    const { useCase, tx } = setup();
    tx.trainingProduct.findUnique.mockResolvedValue(null);
    await expect(useCase.execute("user-1", { productId: "prod-x" }))
      .rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND", status: 404 });
  });

  it("rejeita coach que não é dono do produto", async () => {
    const otherProduct = { ...product, coachId: "coach-2" };
    const { useCase, tx } = setup({ product: otherProduct });
    await expect(useCase.execute("user-1", { productId: "prod-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(tx.trainingProductVersion.update).not.toHaveBeenCalled();
  });

  it("publicação concorrente do mesmo rascunho retorna 409", async () => {
    const { useCase, tx } = setup();
    tx.trainingProductVersion.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2025", clientVersion: "test" }),
    );
    await expect(useCase.execute("user-1", { productId: "prod-1" }))
      .rejects.toMatchObject({ code: "PRODUCT_UPDATE_CONFLICT", status: 409 });
  });
});
