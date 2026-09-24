/**
 * TM021 — SaveProductVersionDraft (editor multimodal).
 *
 * Cobre plano com duas sessões no mesmo dia (corrida + força), criação vs.
 * atualização in-place do rascunho, e duplicação de semana preservando
 * `planSessionId` estável (mesma convenção verificada em TM010).
 */
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { SaveProductVersionDraft } from "@/modules/school/application/save-product-version-draft";
import { duplicatePlanWeek, type PlanPayloadV2 } from "@/modules/school/domain/training-product-version";

const now = new Date("2026-09-23T12:00:00Z");
const product = {
  id: "prod-1", schoolId: null, coachId: "coach-1", title: "Base", description: null,
  sportType: "running", durationWeeks: 12, status: "DRAFT", visibility: "PUBLIC",
  priceCents: null, currency: null, currentVersionId: null,
  slug: null, coverMediaId: null, objective: null, difficulty: null, goalType: null,
  targetEventType: null, targetDistance: null, sessionsPerWeek: null, sessionDurationMin: null,
  sessionDurationMax: null, weeklyMinutesMin: null, weeklyMinutesMax: null, sessionCount: null,
  equipment: null, language: null, availability: null, sellerPolicyVersion: null, previewVersionId: null,
  createdAt: new Date("2026-09-20T12:00:00Z"), updatedAt: new Date("2026-09-20T12:00:00Z"),
};

const multimodalPayload: PlanPayloadV2 = {
  weeks: [
    {
      week: 1,
      days: [
        {
          dayOfWeek: 1,
          sessions: [
            { planSessionId: "s1", workoutTemplateId: "tpl-run", sportType: "run", order: 0 },
            { planSessionId: "s2", workoutTemplateId: "tpl-strength", sportType: "gym", order: 1 },
          ],
        },
      ],
    },
  ],
};

function setup(options: { existingDraft?: unknown; coachId?: string | null } = {}) {
  const tx = {
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE" }) },
    trainingProduct: { findUnique: vi.fn().mockResolvedValue({ ...product, coachId: options.coachId === undefined ? product.coachId : options.coachId }) },
    trainingProductVersion: {
      findFirst: vi.fn().mockResolvedValue(options.existingDraft ?? null),
      update: vi.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        ({ id: where.id, productId: "prod-1", versionNumber: 3, publishedAt: null, ...data })),
      aggregate: vi.fn().mockResolvedValue({ _max: { versionNumber: null } }),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data),
    },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) };
  return { tx, db, useCase: new SaveProductVersionDraft(db as unknown as PrismaClient, () => now) };
}

describe("SaveProductVersionDraft [TM021]", () => {
  it("salva plano com duas sessões no mesmo dia (corrida + força)", async () => {
    const { useCase, tx } = setup();
    const saved = await useCase.execute("user-1", { productId: "prod-1", planPayload: multimodalPayload });
    expect(tx.trainingProductVersion.create).toHaveBeenCalled();
    const payload = (saved as unknown as { planPayload: PlanPayloadV2 }).planPayload;
    expect(payload.weeks[0].days[0].sessions).toHaveLength(2);
    expect(payload.weeks[0].days[0].sessions.map((s) => s.sportType)).toEqual(["run", "gym"]);
  });

  it("cria a primeira versão com versionNumber = 1 quando não há versões anteriores", async () => {
    const { useCase, tx } = setup();
    await useCase.execute("user-1", { productId: "prod-1", planPayload: multimodalPayload });
    expect(tx.trainingProductVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versionNumber: 1, publishedAt: null, schemaVersion: 2 }) }),
    );
  });

  it("numera a próxima versão a partir do máximo existente quando não há rascunho aberto", async () => {
    const { useCase, tx } = setup();
    tx.trainingProductVersion.aggregate.mockResolvedValue({ _max: { versionNumber: 3 } });
    await useCase.execute("user-1", { productId: "prod-1", planPayload: multimodalPayload });
    expect(tx.trainingProductVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versionNumber: 4 }) }),
    );
  });

  it("atualiza o rascunho existente em vez de criar uma nova linha", async () => {
    const { useCase, tx } = setup({ existingDraft: { id: "ver-draft", productId: "prod-1", versionNumber: 3, publishedAt: null } });
    await useCase.execute("user-1", { productId: "prod-1", planPayload: multimodalPayload, changeNote: "ajuste" });
    expect(tx.trainingProductVersion.update).toHaveBeenCalledWith({
      where: { id: "ver-draft" },
      data: { schemaVersion: 2, planPayload: multimodalPayload, changeNote: "ajuste" },
    });
    expect(tx.trainingProductVersion.create).not.toHaveBeenCalled();
  });

  it("duplicação de semana preserva planSessionId estável", async () => {
    const week2 = duplicatePlanWeek(multimodalPayload.weeks[0], 2);
    expect(week2.days[0].sessions.map((s) => s.planSessionId)).toEqual(["s1", "s2"]);
    expect(week2).not.toBe(multimodalPayload.weeks[0]);

    const twoWeekPayload: PlanPayloadV2 = { weeks: [multimodalPayload.weeks[0], week2] };
    const { useCase, tx } = setup();
    const saved = await useCase.execute("user-1", { productId: "prod-1", planPayload: twoWeekPayload }) as unknown as { planPayload: PlanPayloadV2 };
    expect(saved.planPayload.weeks).toHaveLength(2);
    expect(saved.planPayload.weeks[0].days[0].sessions[0].planSessionId).toBe("s1");
    expect(saved.planPayload.weeks[1].days[0].sessions[0].planSessionId).toBe("s1");
    expect(tx.trainingProductVersion.create).toHaveBeenCalled();
  });

  it("rejeita payload inválido antes de abrir transação (dia sem sessão)", async () => {
    const { useCase, db } = setup();
    await expect(useCase.execute("user-1", {
      productId: "prod-1", planPayload: { weeks: [{ week: 1, days: [{ dayOfWeek: 1, sessions: [] }] }] },
    })).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejeita produto inexistente", async () => {
    const { useCase, tx } = setup();
    tx.trainingProduct.findUnique.mockResolvedValue(null);
    await expect(useCase.execute("user-1", { productId: "prod-x", planPayload: multimodalPayload }))
      .rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("rejeita coach que não é dono do produto", async () => {
    const { useCase, tx } = setup({ coachId: "coach-2" });
    await expect(useCase.execute("user-1", { productId: "prod-1", planPayload: multimodalPayload }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tx.trainingProductVersion.create).not.toHaveBeenCalled();
  });
});
