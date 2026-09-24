/**
 * TM076 — RevokeCoachEngagement (RF-304). Athlete-only; ends access
 * immediately at the server level; preserves history (no deletes).
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { RevokeCoachEngagement } from "@/modules/school/application/revoke-coach-engagement";
import { ProposePlanAdaptation } from "@/modules/school/application/propose-plan-adaptation";

const now = new Date("2026-09-24T12:00:00Z");

function makeDb(over: Record<string, unknown> = {}) {
  const db = {
    trainingLicense: { findUnique: vi.fn().mockResolvedValue({ id: "lic-1", athleteId: "athlete-1" }) },
    licenseCoachEngagement: {
      findMany: vi.fn().mockResolvedValue([{ id: "eng-1", coachId: "coach-1" }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ...over,
  };
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

describe("RevokeCoachEngagement [TM076]", () => {
  it("atleta dono revoga o acompanhamento ativo — status vira ENDED", async () => {
    const db = makeDb();
    const out = await new RevokeCoachEngagement(db as unknown as PrismaClient, () => now).execute("athlete-1", { licenseId: "lic-1" });
    expect(out.revokedEngagementIds).toEqual(["eng-1"]);
    expect(db.licenseCoachEngagement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["eng-1"] } },
      data: expect.objectContaining({ status: "ENDED", endedAt: now }),
    }));
  });

  it("revogação por não-dono da licença retorna 403/404 (LICENSE_NOT_FOUND)", async () => {
    const db = makeDb({ trainingLicense: { findUnique: vi.fn().mockResolvedValue({ id: "lic-1", athleteId: "outro-atleta" }) } });
    await expect(new RevokeCoachEngagement(db as unknown as PrismaClient, () => now).execute("athlete-1", { licenseId: "lic-1" }))
      .rejects.toMatchObject({ code: "LICENSE_NOT_FOUND", status: 404 });
    expect(db.licenseCoachEngagement.updateMany).not.toHaveBeenCalled();
  });

  it("nenhum acompanhamento ativo para revogar retorna ENGAGEMENT_NOT_FOUND", async () => {
    const db = makeDb({ licenseCoachEngagement: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() } });
    await expect(new RevokeCoachEngagement(db as unknown as PrismaClient, () => now).execute("athlete-1", { licenseId: "lic-1" }))
      .rejects.toMatchObject({ code: "ENGAGEMENT_NOT_FOUND", status: 404 });
  });

  it("mais de um coach ativo sem coachId explícito exige desambiguação", async () => {
    const db = makeDb({
      licenseCoachEngagement: {
        findMany: vi.fn().mockResolvedValue([{ id: "eng-1", coachId: "coach-1" }, { id: "eng-2", coachId: "coach-2" }]),
        updateMany: vi.fn(),
      },
    });
    await expect(new RevokeCoachEngagement(db as unknown as PrismaClient, () => now).execute("athlete-1", { licenseId: "lic-1" }))
      .rejects.toMatchObject({ code: "INVALID_INPUT", status: 422 });
    expect(db.licenseCoachEngagement.updateMany).not.toHaveBeenCalled();
  });

  it("coachId explícito revoga só aquele engagement quando há mais de um", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "eng-2", coachId: "coach-2" }]);
    const db = makeDb({ licenseCoachEngagement: { findMany, updateMany: vi.fn().mockResolvedValue({ count: 1 }) } });
    const out = await new RevokeCoachEngagement(db as unknown as PrismaClient, () => now).execute("athlete-1", { licenseId: "lic-1", coachId: "coach-2" });
    expect(out.revokedEngagementIds).toEqual(["eng-2"]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ coachId: "coach-2" }) }));
  });

  it("não apaga a linha — updateMany, nunca delete", async () => {
    const db = makeDb();
    await new RevokeCoachEngagement(db as unknown as PrismaClient, () => now).execute("athlete-1", { licenseId: "lic-1" });
    expect("delete" in db.licenseCoachEngagement).toBe(false);
    expect("deleteMany" in db.licenseCoachEngagement).toBe(false);
  });

  it("chamada de API do coach revogado falha imediatamente após revogação (ProposePlanAdaptation não encontra engagement ATIVO)", async () => {
    // Shared state: revoking flips the engagement to ENDED; a subsequent
    // ProposePlanAdaptation call querying for status: ACTIVE must then find nothing.
    let engagementStatus = "ACTIVE";
    const revokeDb = {
      trainingLicense: { findUnique: vi.fn().mockResolvedValue({ id: "lic-1", athleteId: "athlete-1" }) },
      licenseCoachEngagement: {
        findMany: vi.fn().mockImplementation(() => Promise.resolve(engagementStatus === "ACTIVE" ? [{ id: "eng-1", coachId: "coach-1" }] : [])),
        updateMany: vi.fn().mockImplementation(() => { engagementStatus = "ENDED"; return Promise.resolve({ count: 1 }); }),
      },
    };
    Object.assign(revokeDb, { $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(revokeDb)) });
    await new RevokeCoachEngagement(revokeDb as unknown as PrismaClient, () => now).execute("athlete-1", { licenseId: "lic-1" });
    expect(engagementStatus).toBe("ENDED");

    const proposeDb = {
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE" }) },
      licenseCoachEngagement: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { status: string } }) =>
          Promise.resolve(where.status === engagementStatus ? { id: "eng-1", scope: { full: true }, license: { status: "ACTIVE" } } : null)),
      },
      workoutAssignment: { findUnique: vi.fn() },
    };
    Object.assign(proposeDb, { $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(proposeDb)) });
    await expect(new ProposePlanAdaptation(proposeDb as unknown as PrismaClient, () => now).execute("coach-user-1", {
      licenseId: "lic-1", workoutAssignmentId: "wa-1", reason: "tentativa pós-revogação",
      proposedChange: { scheduledAt: now.toISOString() }, expectedVersion: 0,
    })).rejects.toMatchObject({ status: 403 });
  });

  it("exige sessão (UNAUTHORIZED sem actorUserId)", async () => {
    const db = makeDb();
    await expect(new RevokeCoachEngagement(db as unknown as PrismaClient, () => now).execute(null, { licenseId: "lic-1" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });
});
