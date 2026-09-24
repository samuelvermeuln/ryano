/**
 * TM072 — InviteCoachToLicense (RF-301). Explicit scope, PENDING creation,
 * no implied biometric/history grant, RF-305 scope-conflict rejection at
 * invite time.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { InviteCoachToLicense } from "@/modules/school/application/invite-coach-to-license";
import { ProposePlanAdaptation } from "@/modules/school/application/propose-plan-adaptation";

const now = new Date("2026-09-24T12:00:00Z");

function makeDb(over: Record<string, unknown> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const db = {
    trainingLicense: {
      findUnique: vi.fn().mockResolvedValue({ id: "lic-1", athleteId: "athlete-1", status: "ACTIVE" }),
    },
    coachProfile: {
      findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE", userId: "coach-user-1" }),
    },
    school: {
      findUnique: vi.fn().mockResolvedValue({ id: "school-1", status: "ACTIVE" }),
    },
    licenseCoachEngagement: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({ ...data });
      }),
    },
    _created: created,
    ...over,
  };
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

describe("InviteCoachToLicense [TM072]", () => {
  it("cria convite PENDING com escopo completo", async () => {
    const db = makeDb();
    const out = await new InviteCoachToLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { full: true } });
    expect(out).toMatchObject({ status: "PENDING", coachId: "coach-1", athleteId: "athlete-1", licenseId: "lic-1" });
    expect(db.licenseCoachEngagement.create).toHaveBeenCalledTimes(1);
  });

  it("cria convite PENDING com escopo parcial por modalidade", async () => {
    const db = makeDb();
    const out = await new InviteCoachToLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { sportTypes: ["swim"] } });
    expect(out).toMatchObject({ status: "PENDING", scope: { sportTypes: ["swim"] } });
  });

  it("convite pendente não concede leitura alguma antes do aceite (teste negativo explícito)", async () => {
    // A coach with only a PENDING engagement must not be able to read/propose
    // anything through ProposePlanAdaptation (TM074) — which requires ACTIVE.
    const inviteDb = makeDb();
    await new InviteCoachToLicense(inviteDb as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { full: true } });

    const proposeDb = {
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE" }) },
      // The engagement created above is PENDING — ProposePlanAdaptation only
      // looks for status: ACTIVE, so this must resolve to nothing.
      licenseCoachEngagement: { findFirst: vi.fn().mockResolvedValue(null) },
      workoutAssignment: { findUnique: vi.fn() },
    };
    Object.assign(proposeDb, { $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(proposeDb)) });

    await expect(new ProposePlanAdaptation(proposeDb as unknown as PrismaClient, () => now).execute("coach-user-1", {
      licenseId: "lic-1", workoutAssignmentId: "wa-1", reason: "tentativa antes do aceite",
      proposedChange: { scheduledAt: now.toISOString() }, expectedVersion: 0,
    })).rejects.toMatchObject({ status: 403 });
    expect(proposeDb.workoutAssignment.findUnique).not.toHaveBeenCalled();
  });

  it("licença de outro atleta retorna LICENSE_NOT_FOUND (não vaza existência)", async () => {
    const db = makeDb({
      trainingLicense: { findUnique: vi.fn().mockResolvedValue({ id: "lic-1", athleteId: "outro-atleta", status: "ACTIVE" }) },
    });
    await expect(new InviteCoachToLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { full: true } }))
      .rejects.toMatchObject({ code: "LICENSE_NOT_FOUND", status: 404 });
  });

  it("licença não ativa retorna LICENSE_NOT_ACTIVE", async () => {
    const db = makeDb({
      trainingLicense: { findUnique: vi.fn().mockResolvedValue({ id: "lic-1", athleteId: "athlete-1", status: "PAUSED" }) },
    });
    await expect(new InviteCoachToLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { full: true } }))
      .rejects.toMatchObject({ code: "LICENSE_NOT_ACTIVE", status: 409 });
  });

  it("coach inexistente retorna COACH_PROFILE_NOT_FOUND", async () => {
    const db = makeDb({ coachProfile: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(new InviteCoachToLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { full: true } }))
      .rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND", status: 404 });
  });

  it("coach inativo retorna COACH_INACTIVE", async () => {
    const db = makeDb({ coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "SUSPENDED", userId: "coach-user-1" }) } });
    await expect(new InviteCoachToLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { full: true } }))
      .rejects.toMatchObject({ code: "COACH_INACTIVE", status: 409 });
  });

  it("atleta não pode se autoconvidar (coach é o próprio usuário)", async () => {
    const db = makeDb({ coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE", userId: "athlete-1" }) } });
    await expect(new InviteCoachToLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { full: true } }))
      .rejects.toMatchObject({ code: "ENGAGEMENT_INVALID_TARGET", status: 422 });
  });

  it("convite duplicado ao mesmo coach (índice único parcial) retorna ENGAGEMENT_ALREADY_ACTIVE", async () => {
    const db = makeDb({
      licenseCoachEngagement: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" })),
      },
    });
    await expect(new InviteCoachToLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { full: true } }))
      .rejects.toMatchObject({ code: "ENGAGEMENT_ALREADY_ACTIVE", status: 409 });
  });

  it("RF-305: rejeita segundo convite (outro coach) com escopo conflitante (full)", async () => {
    const db = makeDb({
      licenseCoachEngagement: {
        findMany: vi.fn().mockResolvedValue([{ coachId: "coach-other", scope: { full: true } }]),
        create: vi.fn(),
      },
    });
    await expect(new InviteCoachToLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { sportTypes: ["run"] } }))
      .rejects.toMatchObject({ code: "ENGAGEMENT_SCOPE_CONFLICT", status: 409 });
  });

  it("RF-305: permite coach de natação (swim) conviver com coach de corrida (run) já ativo, sem conflito", async () => {
    const db = makeDb({
      licenseCoachEngagement: {
        findMany: vi.fn().mockResolvedValue([{ coachId: "coach-run", scope: { sportTypes: ["run"] } }]),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(data)),
      },
    });
    const out = await new InviteCoachToLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { sportTypes: ["swim"] } });
    expect(out).toMatchObject({ status: "PENDING" });
  });
});
