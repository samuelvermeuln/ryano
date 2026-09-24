/**
 * TM040 — ListMyTrainingLicenses: GET /api/me/training-licenses's use case
 * (RF-111). Focus: ownership scoping (never another athlete's row, even
 * when the caller could pass any filter) and state derivation for the six
 * `/app/planos` buckets.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ListMyTrainingLicenses } from "@/modules/school/application/list-my-training-licenses";

function makeDb(over: Record<string, unknown> = {}) {
  return {
    trainingLicense: { findMany: vi.fn().mockResolvedValue([]) },
    trainingPurchase: { findMany: vi.fn().mockResolvedValue([]) },
    ...over,
  } as unknown as PrismaClient;
}

describe("ListMyTrainingLicenses [TM040]", () => {
  it("filtra sempre por athleteId do ator — nunca aceita athleteId de outra origem", async () => {
    const db = makeDb();
    await new ListMyTrainingLicenses(db).execute("athlete-1", {});
    expect((db.trainingLicense.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where).toMatchObject({ athleteId: "athlete-1" });
    expect((db.trainingPurchase.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where).toMatchObject({ athleteId: "athlete-1" });
  });

  it("nunca retorna licença de outro athleteId mesmo com input adivinhado", async () => {
    const db = makeDb({
      trainingLicense: {
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          // Simulates a real DB honoring the where-clause: only athlete-1's row exists.
          if (where.athleteId !== "athlete-1") return [];
          return [{
            id: "lic-1", productId: "prod-1", versionId: "ver-1", purchaseId: "purchase-1", athleteId: "athlete-1",
            status: "ACTIVE", activationMode: null, activationStatus: "PENDING", timezone: null,
            chosenStartLocalDate: null, anchorEventLocalDate: null, calendarInstantiated: false,
            calendarInstantiatedAt: null, completedAt: null, updatedAt: new Date(), product: null,
          }];
        }),
      },
    });
    // The route only ever forwards `limit`/`cursor` from the query string —
    // `execute()`'s only source of `athleteId` is the actor argument, which
    // here belongs to a different athlete than the one owning the stored row.
    const out = await new ListMyTrainingLicenses(db).execute("athlete-2", {});
    expect(out.licenses).toHaveLength(0);
  });

  it("rejeita athleteId vindo do corpo/query (strictObject) — defesa em profundidade", async () => {
    const db = makeDb();
    await expect(new ListMyTrainingLicenses(db).execute("athlete-2", { athleteId: "athlete-1" } as never))
      .rejects.toBeInstanceOf(Error);
  });

  it("deriva estado 'nao_iniciado' quando activationStatus=PENDING", async () => {
    const db = makeDb({
      trainingLicense: {
        findMany: vi.fn().mockResolvedValue([{
          id: "lic-1", productId: "prod-1", versionId: "ver-1", purchaseId: "purchase-1", athleteId: "athlete-1",
          status: "ACTIVE", activationMode: null, activationStatus: "PENDING", timezone: null,
          chosenStartLocalDate: null, anchorEventLocalDate: null, calendarInstantiated: false,
          calendarInstantiatedAt: null, completedAt: null, updatedAt: new Date(),
          product: { id: "prod-1", title: "Plano 5k", sportType: "run", durationWeeks: 8, coach: { displayName: "Coach A" }, school: null },
        }]),
      },
    });
    const out = await new ListMyTrainingLicenses(db).execute("athlete-1", {});
    expect(out.licenses[0]!.state).toBe("not_started");
    expect(out.licenses[0]!.author).toEqual({ type: "coach", name: "Coach A" });
  });

  it("deriva estado 'em_andamento' quando ativado e ACTIVE", async () => {
    const db = makeDb({
      trainingLicense: {
        findMany: vi.fn().mockResolvedValue([{
          id: "lic-1", productId: "prod-1", versionId: "ver-1", purchaseId: "purchase-1", athleteId: "athlete-1",
          status: "ACTIVE", activationMode: "START_NOW", activationStatus: "ACTIVATED", timezone: "America/Sao_Paulo",
          chosenStartLocalDate: "2026-09-21", anchorEventLocalDate: null, calendarInstantiated: true,
          calendarInstantiatedAt: new Date(), completedAt: null, updatedAt: new Date(), product: null,
        }]),
      },
    });
    const out = await new ListMyTrainingLicenses(db).execute("athlete-1", {});
    expect(out.licenses[0]!.state).toBe("in_progress");
  });

  it("deriva estado 'pausado'/'concluido'/'reembolsado' a partir do status da licença", async () => {
    const base = {
      id: "lic-1", productId: "prod-1", versionId: "ver-1", purchaseId: "purchase-1", athleteId: "athlete-1",
      activationMode: "START_NOW", activationStatus: "ACTIVATED", timezone: "America/Sao_Paulo",
      chosenStartLocalDate: "2026-09-21", anchorEventLocalDate: null, calendarInstantiated: true,
      calendarInstantiatedAt: new Date(), completedAt: null, updatedAt: new Date(), product: null,
    };
    for (const [status, expected] of [["PAUSED", "paused"], ["COMPLETED", "completed"], ["REVOKED", "refunded"], ["EXPIRED", "expired"]] as const) {
      const db = makeDb({ trainingLicense: { findMany: vi.fn().mockResolvedValue([{ ...base, status }]) } });
      const out = await new ListMyTrainingLicenses(db).execute("athlete-1", {});
      expect(out.licenses[0]!.state).toBe(expected);
    }
  });

  it("compras pagas pendentes sem licença aparecem como 'aguardando_pagamento'", async () => {
    const db = makeDb({
      trainingPurchase: {
        findMany: vi.fn().mockResolvedValue([{
          id: "purchase-1", productId: "prod-2", status: "PENDING", pricePaid: 4990, currency: "BRL",
          purchasedAt: new Date(), product: { id: "prod-2", title: "Plano 10k", sportType: "run", durationWeeks: 12 },
        }]),
      },
    });
    const out = await new ListMyTrainingLicenses(db).execute("athlete-1", {});
    expect(out.pendingPurchases).toHaveLength(1);
    expect(out.pendingPurchases[0]!.state).toBe("awaiting_payment");
  });
});
