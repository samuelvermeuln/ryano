import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { UpdateHistoryGrant } from "@/modules/school/application/update-history-grant";
import { createHistoryAccessGrant, type HistoryAccessGrant } from "@/modules/school/domain/history-access-grant";

const createdAt = new Date("2026-09-15T12:00:00Z");
const now = new Date("2026-09-16T12:00:00Z");
const scope = { activities: true, metrics: false, prescribedWorkouts: false, compliance: false,
  coachScores: false, coachComments: false, assessments: false, athleteFeedback: false };

function setup(changes: Partial<HistoryAccessGrant> = {}) {
  const grant = { ...createHistoryAccessGrant({ id: "grant", athleteId: "athlete", grantedBy: "athlete",
    granteeType: "SCHOOL", granteeId: "school", schoolId: "school", coachId: null, scope,
    fromDate: new Date("2020-01-01"), toDate: new Date("2020-12-31"),
  }, createdAt), ...changes };
  const tx = { historyAccessGrant: {
    findUnique: vi.fn().mockResolvedValue(grant),
    update: vi.fn().mockImplementation(async ({ data }: { data: Partial<HistoryAccessGrant> }) => ({ ...grant, ...data })),
  } };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) };
  return { grant, tx, db, useCase: new UpdateHistoryGrant(db as unknown as PrismaClient, () => now) };
}

describe("UpdateHistoryGrant [T105]", () => {
  it("replaces explicit scope while preserving recipient, consent and omitted dates", async () => {
    const { grant, tx, db, useCase } = setup();
    const changedScope = { ...scope, activities: false, metrics: true };
    await expect(useCase.execute("athlete", { grantId: "grant", scope: changedScope }))
      .resolves.toEqual({ ...grant, scope: changedScope, updatedAt: now });
    expect(tx.historyAccessGrant.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "grant", athleteId: "athlete", grantedBy: "athlete", status: "ACTIVE", updatedAt: createdAt },
      data: { scope: changedScope, fromDate: grant.fromDate, toDate: grant.toDate, updatedAt: now },
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("distinguishes an omitted date from an explicitly cleared boundary", async () => {
    const { useCase, grant } = setup();
    await expect(useCase.execute("athlete", { grantId: "grant", fromDate: null }))
      .resolves.toMatchObject({ fromDate: null, toDate: grant.toDate, scope });
    await expect(useCase.execute("athlete", { grantId: "grant", toDate: "2021-12-31" }))
      .resolves.toMatchObject({ fromDate: grant.fromDate, toDate: new Date("2021-12-31"), scope });
  });

  it.each([null, "", " athlete"])("rejects unauthenticated actor %j", async (actor) => {
    const { db, useCase } = setup();
    await expect(useCase.execute(actor, { grantId: "grant", scope })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(["coach", "school-admin", "another-athlete"])("denies %s ownership overrides", async (actor) => {
    const { tx, useCase } = setup();
    await expect(useCase.execute(actor, { grantId: "grant", scope })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tx.historyAccessGrant.update).not.toHaveBeenCalled();
  });

  it.each([{}, { granteeId: "other" }, { athleteId: "victim" }, { grantedBy: "victim" },
    { status: "ACTIVE" }, { revokedAt: now }, { scope: { activities: true } }, { fromDate: "bad" }])(
    "rejects empty updates and immutable or invalid fields %j", async (changes) => {
      const { db, useCase } = setup();
      await expect(useCase.execute("athlete", { grantId: "grant", ...changes })).rejects.toBeInstanceOf(ZodError);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it("validates a partial date update against the retained boundary", async () => {
    const { tx, useCase } = setup();
    await expect(useCase.execute("athlete", { grantId: "grant", fromDate: "2021-01-01" })).rejects.toBeInstanceOf(ZodError);
    expect(tx.historyAccessGrant.update).not.toHaveBeenCalled();
  });

  it.each(["REVOKED", "EXPIRED"] as const)("does not reopen %s grants", async (status) => {
    const { tx, useCase } = setup({ status,
      revokedBy: status === "REVOKED" ? "athlete" : null,
      revokedAt: status === "REVOKED" ? createdAt : null });
    await expect(useCase.execute("athlete", { grantId: "grant", scope })).rejects.toMatchObject({ code: "HISTORY_GRANT_NOT_ACTIVE" });
    expect(tx.historyAccessGrant.update).not.toHaveBeenCalled();
  });

  it("rejects missing grants and stale clocks without writing", async () => {
    const missing = setup();
    missing.tx.historyAccessGrant.findUnique.mockResolvedValue(null);
    await expect(missing.useCase.execute("athlete", { grantId: "grant", scope })).rejects.toMatchObject({ code: "HISTORY_GRANT_NOT_FOUND" });
    expect(missing.tx.historyAccessGrant.update).not.toHaveBeenCalled();
    const future = setup({ updatedAt: new Date("2026-10-01") });
    await expect(future.useCase.execute("athlete", { grantId: "grant", scope })).rejects.toMatchObject({ code: "HISTORY_GRANT_INVALID_TIMESTAMP" });
    expect(future.tx.historyAccessGrant.update).not.toHaveBeenCalled();
  });

  it.each(["P2025", "P2034"])("reports %s concurrency conflicts without silently retrying consent", async (code) => {
    const { tx, useCase } = setup();
    tx.historyAccessGrant.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("internal", { code, clientVersion: "test" }));
    await expect(useCase.execute("athlete", { grantId: "grant", scope }))
      .rejects.toMatchObject({ code: "HISTORY_GRANT_UPDATE_CONFLICT", status: 409 });
    expect(tx.historyAccessGrant.update).toHaveBeenCalledTimes(1);
  });
});
