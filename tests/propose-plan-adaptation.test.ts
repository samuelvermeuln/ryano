/**
 * TM074 — ProposePlanAdaptation (RF-303, design D-06). Only a coach with an
 * ACTIVE engagement on the license may propose; scope is enforced per
 * modality (RF-305); expectedVersion guards against stale proposals.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ProposePlanAdaptation } from "@/modules/school/application/propose-plan-adaptation";

const now = new Date("2026-09-24T12:00:00Z");

function assignmentRow(over: Record<string, unknown> = {}) {
  return {
    id: "wa-1", trainingLicenseId: "lic-1", scheduledAt: new Date("2026-09-25T09:00:00Z"), dueAt: null,
    workoutTemplateId: "tpl-1", adaptationVersion: 0, workoutTemplate: { sportType: "run" },
    ...over,
  };
}

function makeDb(over: Record<string, unknown> = {}) {
  const db = {
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE" }) },
    licenseCoachEngagement: {
      findFirst: vi.fn().mockResolvedValue({ id: "eng-1", scope: { full: true }, license: { status: "ACTIVE" } }),
    },
    workoutAssignment: { findUnique: vi.fn().mockResolvedValue(assignmentRow()) },
    planAdaptation: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "adapt-1", ...data })),
    },
    ...over,
  };
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

const baseInput = {
  licenseId: "lic-1", workoutAssignmentId: "wa-1", reason: "Ajustar volume da semana",
  proposedChange: { scheduledAt: "2026-09-26T09:00:00.000Z" }, expectedVersion: 0,
};

describe("ProposePlanAdaptation [TM074]", () => {
  it("coach com engagement ATIVO propõe ajuste — PlanAdaptation PENDING", async () => {
    const db = makeDb();
    const out = await new ProposePlanAdaptation(db as unknown as PrismaClient, () => now).execute("coach-user-1", baseInput);
    expect(out).toMatchObject({ status: "PENDING", licenseId: "lic-1", workoutAssignmentId: "wa-1" });
    expect((out as { beforeSnapshot: Record<string, unknown> }).beforeSnapshot).toMatchObject({ workoutTemplateId: "tpl-1" });
  });

  it("coach sem engagement ativo na licença recebe 403", async () => {
    const db = makeDb({ licenseCoachEngagement: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(new ProposePlanAdaptation(db as unknown as PrismaClient, () => now).execute("coach-user-1", baseInput))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("engagement PENDING (não aceito ainda) não conta como ativo — a query já filtra por status: ACTIVE", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = makeDb({ licenseCoachEngagement: { findFirst } });
    await expect(new ProposePlanAdaptation(db as unknown as PrismaClient, () => now).execute("coach-user-1", baseInput))
      .rejects.toMatchObject({ status: 403 });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "ACTIVE" }),
    }));
  });

  it("sessão de outra licença (fora do escopo do engagement) retorna WORKOUT_ASSIGNMENT_NOT_FOUND", async () => {
    const db = makeDb({ workoutAssignment: { findUnique: vi.fn().mockResolvedValue(assignmentRow({ trainingLicenseId: "outra-licenca" })) } });
    await expect(new ProposePlanAdaptation(db as unknown as PrismaClient, () => now).execute("coach-user-1", baseInput))
      .rejects.toMatchObject({ code: "WORKOUT_ASSIGNMENT_NOT_FOUND", status: 404 });
  });

  it("RF-305: escopo parcial (swim) rejeita proposta sobre sessão de outra modalidade (run)", async () => {
    const db = makeDb({
      licenseCoachEngagement: { findFirst: vi.fn().mockResolvedValue({ id: "eng-1", scope: { sportTypes: ["swim"] }, license: { status: "ACTIVE" } }) },
    });
    await expect(new ProposePlanAdaptation(db as unknown as PrismaClient, () => now).execute("coach-user-1", baseInput))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("RF-305: escopo parcial (run) permite proposta sobre sessão da mesma modalidade", async () => {
    const db = makeDb({
      licenseCoachEngagement: { findFirst: vi.fn().mockResolvedValue({ id: "eng-1", scope: { sportTypes: ["run"] }, license: { status: "ACTIVE" } }) },
    });
    const out = await new ProposePlanAdaptation(db as unknown as PrismaClient, () => now).execute("coach-user-1", baseInput);
    expect(out).toMatchObject({ status: "PENDING" });
  });

  it("duas propostas concorrentes: a segunda com expectedVersion obsoleto retorna 409", async () => {
    const db = makeDb({ workoutAssignment: { findUnique: vi.fn().mockResolvedValue(assignmentRow({ adaptationVersion: 1 })) } });
    // Client still holds expectedVersion=0 (stale — someone else's proposal was already accepted, bumping the assignment to version 1).
    await expect(new ProposePlanAdaptation(db as unknown as PrismaClient, () => now).execute("coach-user-1", { ...baseInput, expectedVersion: 0 }))
      .rejects.toMatchObject({ code: "ADAPTATION_VERSION_CONFLICT", status: 409 });
  });

  it("reason vazio é rejeitado pelo schema", async () => {
    const db = makeDb();
    await expect(new ProposePlanAdaptation(db as unknown as PrismaClient, () => now).execute("coach-user-1", { ...baseInput, reason: "" }))
      .rejects.toBeDefined();
  });

  it("proposedChange sem nenhum campo é rejeitado pelo schema", async () => {
    const db = makeDb();
    await expect(new ProposePlanAdaptation(db as unknown as PrismaClient, () => now).execute("coach-user-1", { ...baseInput, proposedChange: {} }))
      .rejects.toBeDefined();
  });
});
