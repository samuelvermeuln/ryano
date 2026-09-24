/**
 * TM075 — DecidePlanAdaptation (RF-303, design D-06). Only the owning
 * athlete decides; accept applies the change and bumps adaptationVersion;
 * decline leaves the assignment untouched.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { DecidePlanAdaptation } from "@/modules/school/application/decide-plan-adaptation";

const now = new Date("2026-09-24T12:00:00Z");

function adaptationRow(over: Record<string, unknown> = {}) {
  return {
    id: "adapt-1", licenseId: "lic-1", workoutAssignmentId: "wa-1", coachId: "coach-1", status: "PENDING",
    proposedSnapshot: { scheduledAt: "2026-09-26T09:00:00.000Z", dueAt: null, workoutTemplateId: "tpl-2" },
    expectedVersion: 0,
    ...over,
  };
}

function assignmentRow(over: Record<string, unknown> = {}) {
  return {
    id: "wa-1", adaptationVersion: 0, scheduledAt: new Date("2026-09-25T09:00:00Z"), dueAt: null,
    workoutTemplateId: "tpl-1", originalSnapshot: null,
    ...over,
  };
}

function makeDb(over: Record<string, unknown> = {}) {
  const db = {
    planAdaptation: {
      findUnique: vi.fn().mockResolvedValue(adaptationRow()),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "adapt-1", ...data })),
    },
    trainingLicense: { findUnique: vi.fn().mockResolvedValue({ athleteId: "athlete-1" }) },
    workoutAssignment: {
      findUnique: vi.fn().mockResolvedValue(assignmentRow()),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "wa-1", ...data })),
    },
    workoutAssignmentHistory: { create: vi.fn().mockResolvedValue({}) },
    ...over,
  };
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

const decideInput = { licenseId: "lic-1", adaptationId: "adapt-1" };

describe("DecidePlanAdaptation [TM075]", () => {
  it("atleta dono aceita — aplica a mudança e incrementa adaptationVersion", async () => {
    const db = makeDb();
    const out = await new DecidePlanAdaptation(db as unknown as PrismaClient, () => now).execute("athlete-1", { ...decideInput, decision: "ACCEPT" });
    expect(out.adaptation).toMatchObject({ status: "ACCEPTED", acceptedByAthleteAt: now });
    expect(db.workoutAssignment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "wa-1" },
      data: expect.objectContaining({
        workoutTemplateId: "tpl-2", adaptationVersion: { increment: 1 }, effectiveRevisionId: "adapt-1", adjustedByCoachId: "coach-1",
      }),
    }));
    expect(db.workoutAssignmentHistory.create).toHaveBeenCalledTimes(1);
  });

  it("registra originalSnapshot na primeira adaptação aceita, preservando o dado original", async () => {
    const db = makeDb();
    await new DecidePlanAdaptation(db as unknown as PrismaClient, () => now).execute("athlete-1", { ...decideInput, decision: "ACCEPT" });
    const call = db.workoutAssignment.update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(call.data.originalSnapshot).toMatchObject({ workoutTemplateId: "tpl-1" });
  });

  it("atleta dono recusa — assignment NÃO é alterado", async () => {
    const db = makeDb();
    const out = await new DecidePlanAdaptation(db as unknown as PrismaClient, () => now).execute("athlete-1", { ...decideInput, decision: "DECLINE" });
    expect(out.adaptation).toMatchObject({ status: "DECLINED" });
    expect(db.workoutAssignment.update).not.toHaveBeenCalled();
    expect(db.workoutAssignmentHistory.create).not.toHaveBeenCalled();
  });

  it("coach chamando decide recebe 403", async () => {
    const db = makeDb();
    await expect(new DecidePlanAdaptation(db as unknown as PrismaClient, () => now).execute("coach-user-1", { ...decideInput, decision: "ACCEPT" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("outro usuário que não o atleta dono chamando decide recebe 403", async () => {
    const db = makeDb();
    await expect(new DecidePlanAdaptation(db as unknown as PrismaClient, () => now).execute("outro-atleta", { ...decideInput, decision: "ACCEPT" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("ajuste inexistente retorna ADAPTATION_NOT_FOUND", async () => {
    const db = makeDb({ planAdaptation: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    await expect(new DecidePlanAdaptation(db as unknown as PrismaClient, () => now).execute("athlete-1", { ...decideInput, decision: "ACCEPT" }))
      .rejects.toMatchObject({ code: "ADAPTATION_NOT_FOUND", status: 404 });
  });

  it("ajuste já decidido retorna ADAPTATION_NOT_PENDING", async () => {
    const db = makeDb({ planAdaptation: { findUnique: vi.fn().mockResolvedValue(adaptationRow({ status: "ACCEPTED" })), update: vi.fn() } });
    await expect(new DecidePlanAdaptation(db as unknown as PrismaClient, () => now).execute("athlete-1", { ...decideInput, decision: "DECLINE" }))
      .rejects.toMatchObject({ code: "ADAPTATION_NOT_PENDING", status: 409 });
  });

  it("sessão mudou desde a proposta (adaptationVersion divergente) retorna ADAPTATION_VERSION_CONFLICT", async () => {
    const db = makeDb({ workoutAssignment: { findUnique: vi.fn().mockResolvedValue(assignmentRow({ adaptationVersion: 2 })), update: vi.fn() } });
    await expect(new DecidePlanAdaptation(db as unknown as PrismaClient, () => now).execute("athlete-1", { ...decideInput, decision: "ACCEPT" }))
      .rejects.toMatchObject({ code: "ADAPTATION_VERSION_CONFLICT", status: 409 });
  });

  it("histórico consultável — payload registra antes/depois e autoria do coach", async () => {
    const db = makeDb();
    await new DecidePlanAdaptation(db as unknown as PrismaClient, () => now).execute("athlete-1", { ...decideInput, decision: "ACCEPT" });
    expect(db.workoutAssignmentHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventType: "PLAN_ADAPTATION_ACCEPTED", actorUserId: "athlete-1",
        payload: expect.objectContaining({ adaptationId: "adapt-1", coachId: "coach-1" }),
      }),
    }));
  });
});
