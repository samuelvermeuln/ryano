import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { RevokeHistoryAccess } from "@/modules/school/application/revoke-history-access";
import { createHistoryAccessGrant, type HistoryAccessGrant } from "@/modules/school/domain/history-access-grant";

const createdAt = new Date("2026-09-15T12:00:00Z");
const now = new Date("2026-09-16T12:00:00Z");
const conflict = (code: string) => new Prisma.PrismaClientKnownRequestError("internal", { code, clientVersion: "test" });

function setup(changes: Partial<HistoryAccessGrant> = {}) {
  const initial = { ...createHistoryAccessGrant({ id: "grant", athleteId: "athlete", grantedBy: "athlete",
    granteeType: "SCHOOL", granteeId: "school", schoolId: "school", coachId: null,
    fromDate: new Date("2020-01-01"), toDate: null,
    scope: { activities: true, metrics: false, prescribedWorkouts: false, compliance: false,
      coachScores: false, coachComments: false, assessments: false, athleteFeedback: false },
  }, createdAt), ...changes };
  const state = { grant: initial };
  const tx = { historyAccessGrant: {
    findUnique: vi.fn().mockImplementation(async () => state.grant),
    update: vi.fn().mockImplementation(async ({ data }: { data: Partial<HistoryAccessGrant> }) => {
      state.grant = { ...state.grant, ...data };
      return state.grant;
    }),
  } };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) };
  const clock = vi.fn(() => now);
  return { state, initial, tx, db, clock, useCase: new RevokeHistoryAccess(db as unknown as PrismaClient, clock) };
}

describe("RevokeHistoryAccess [T106]", () => {
  it("revokes atomically without deleting or changing scope, recipient or consent history", async () => {
    const { initial, tx, db, useCase } = setup();
    await expect(useCase.execute("athlete", { grantId: "grant" })).resolves.toEqual({
      ...initial, status: "REVOKED", revokedBy: "athlete", revokedAt: now, updatedAt: now,
    });
    expect(tx.historyAccessGrant.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "grant", athleteId: "athlete", grantedBy: "athlete", status: "ACTIVE", updatedAt: createdAt },
      data: { status: "REVOKED", revokedBy: "athlete", revokedAt: now, updatedAt: now },
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("returns the original revocation on repeat and still checks the actor", async () => {
    const { tx, clock, useCase } = setup();
    const first = await useCase.execute("athlete", { grantId: "grant" });
    clock.mockReturnValue(new Date("2026-10-01"));
    await expect(useCase.execute("athlete", { grantId: "grant" })).resolves.toEqual(first);
    await expect(useCase.execute("other", { grantId: "grant" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tx.historyAccessGrant.update).toHaveBeenCalledTimes(1);
    expect(clock).toHaveBeenCalledTimes(1);
  });

  it.each([null, "", " athlete"])("rejects invalid actor %j before lookup", async (actor) => {
    const { db, useCase } = setup();
    await expect(useCase.execute(actor, { grantId: "grant" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([{}, { grantId: "" }, { grantId: "grant", athleteId: "victim" },
    { grantId: "grant", revokedBy: "victim" }, { grantId: "grant", revokedAt: now }])(
    "rejects invalid or injected input %j", async (raw) => {
      const { db, useCase } = setup();
      await expect(useCase.execute("athlete", raw)).rejects.toBeInstanceOf(ZodError);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each(["school-admin", "coach", "other-athlete"])("denies %s access to another athlete's grant", async (actor) => {
    const { tx, useCase } = setup();
    await expect(useCase.execute(actor, { grantId: "grant" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tx.historyAccessGrant.update).not.toHaveBeenCalled();
  });

  it("rejects absent, expired and future-dated grants without writing", async () => {
    const missing = setup();
    missing.tx.historyAccessGrant.findUnique.mockResolvedValue(null);
    await expect(missing.useCase.execute("athlete", { grantId: "grant" })).rejects.toMatchObject({ code: "HISTORY_GRANT_NOT_FOUND" });
    expect(missing.tx.historyAccessGrant.update).not.toHaveBeenCalled();
    const expired = setup({ status: "EXPIRED" });
    await expect(expired.useCase.execute("athlete", { grantId: "grant" })).rejects.toMatchObject({ code: "HISTORY_GRANT_NOT_ACTIVE" });
    expect(expired.tx.historyAccessGrant.update).not.toHaveBeenCalled();
    const future = setup({ updatedAt: new Date("2026-10-01") });
    await expect(future.useCase.execute("athlete", { grantId: "grant" })).rejects.toMatchObject({ code: "HISTORY_GRANT_INVALID_TIMESTAMP" });
    expect(future.tx.historyAccessGrant.update).not.toHaveBeenCalled();
  });

  it("rereads a concurrent revocation without overwriting its audit timestamp", async () => {
    const { initial, state, tx, useCase } = setup();
    const concurrent = { ...initial, status: "REVOKED" as const,
      revokedBy: "athlete", revokedAt: createdAt, updatedAt: createdAt };
    tx.historyAccessGrant.update.mockImplementationOnce(async () => {
      state.grant = concurrent;
      throw conflict("P2025");
    });
    await expect(useCase.execute("athlete", { grantId: "grant" })).resolves.toEqual(concurrent);
    expect(tx.historyAccessGrant.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.historyAccessGrant.update).toHaveBeenCalledTimes(1);
  });

  it.each(["P2025", "P2034"])("bounds retries and maps %s to a safe conflict", async (code) => {
    const { tx, db, useCase } = setup();
    tx.historyAccessGrant.update.mockRejectedValue(conflict(code));
    await expect(useCase.execute("athlete", { grantId: "grant" }))
      .rejects.toMatchObject({ code: "HISTORY_GRANT_REVOKE_CONFLICT", status: 409 });
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });

  it("propagates unexpected persistence errors without retry", async () => {
    const { tx, db, useCase } = setup();
    const error = new Error("database unavailable");
    tx.historyAccessGrant.update.mockRejectedValue(error);
    await expect(useCase.execute("athlete", { grantId: "grant" })).rejects.toBe(error);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
