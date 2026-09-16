import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { GrantHistoryAccess } from "@/modules/school/application/grant-history-access";

const now = new Date("2026-09-15T12:00:00Z");
const input = { granteeType: "SCHOOL", granteeId: "school",
  scope: { activities: true, metrics: false, prescribedWorkouts: false, compliance: false,
    coachScores: false, coachComments: false, assessments: false, athleteFeedback: false } };

function setup() {
  const tx = {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school", status: "ACTIVE" }) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE" }) },
    historyAccessGrant: { create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => data) },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) };
  return { tx, db, useCase: new GrantHistoryAccess(db as unknown as PrismaClient, () => now) };
}

describe("GrantHistoryAccess [T104]", () => {
  it.each(["SCHOOL", "COACH"])("creates explicit %s consent solely for the session athlete", async (granteeType) => {
    const { tx, db, useCase } = setup();
    const granteeId = granteeType === "SCHOOL" ? "school" : "coach";
    const grant = await useCase.execute("athlete", { ...input, granteeType, granteeId });
    expect(grant).toMatchObject({
      athleteId: "athlete", grantedBy: "athlete", grantedAt: now, granteeType, granteeId,
      schoolId: granteeType === "SCHOOL" ? "school" : null,
      coachId: granteeType === "COACH" ? "coach" : null,
      scope: input.scope, fromDate: null, toDate: null,
      status: "ACTIVE", revokedBy: null, revokedAt: null,
    });
    expect(tx.historyAccessGrant.create).toHaveBeenCalledExactlyOnceWith({ data: grant });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.school.findUnique).toHaveBeenCalledTimes(granteeType === "SCHOOL" ? 1 : 0);
    expect(tx.coachProfile.findUnique).toHaveBeenCalledTimes(granteeType === "COACH" ? 1 : 0);
  });

  it("keeps a requested past period in UTC without expiring the consent", async () => {
    const { useCase } = setup();
    await expect(useCase.execute("athlete", { ...input, fromDate: "2020-01-01", toDate: "2020-12-31" }))
      .resolves.toMatchObject({ fromDate: new Date("2020-01-01"), toDate: new Date("2020-12-31"), status: "ACTIVE" });
  });

  it.each([null, "", " athlete"])("rejects invalid session actor %j before database access", async (actor) => {
    const { useCase, db } = setup();
    await expect(useCase.execute(actor, input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    { athleteId: "victim" }, { grantedBy: "victim" }, { schoolId: "other" }, { status: "ACTIVE" },
    { scope: {} }, { scope: { ...input.scope, all: true } }, { granteeType: "ADMIN" },
    { granteeId: "" }, { fromDate: "2026-02-30" }, { fromDate: "2020-01-01T12:00:00Z" },
    { fromDate: "2020-02-01", toDate: "2020-01-01" },
  ])("rejects malformed or impersonated consent %j before persistence", async (invalid) => {
    const { useCase, db } = setup();
    await expect(useCase.execute("athlete", { ...input, ...invalid })).rejects.toBeInstanceOf(ZodError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(["SCHOOL", "COACH"])("rejects absent and inactive %s recipients", async (granteeType) => {
    const { tx, useCase } = setup();
    const recipient = granteeType === "SCHOOL" ? tx.school : tx.coachProfile;
    recipient.findUnique.mockResolvedValueOnce(null);
    await expect(useCase.execute("athlete", { ...input, granteeType })).rejects.toMatchObject({
      code: granteeType === "SCHOOL" ? "SCHOOL_NOT_FOUND" : "COACH_PROFILE_NOT_FOUND",
    });
    recipient.findUnique.mockResolvedValueOnce({ id: "school", status: "INACTIVE" });
    await expect(useCase.execute("athlete", { ...input, granteeType })).rejects.toMatchObject({
      code: granteeType === "SCHOOL" ? "SCHOOL_INACTIVE" : "COACH_INACTIVE",
    });
    expect(tx.historyAccessGrant.create).not.toHaveBeenCalled();
  });

  it.each(["P2002", "P2003", "P2034"])("maps persistence conflict %s to a safe error", async (code) => {
    const { tx, useCase } = setup();
    tx.historyAccessGrant.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("private detail", { code, clientVersion: "test" }));
    await expect(useCase.execute("athlete", input)).rejects.toMatchObject({ code: "HISTORY_GRANT_CREATE_CONFLICT", status: 409 });
  });

  it("does not swallow an unexpected database failure", async () => {
    const { tx, useCase } = setup();
    const failure = new Error("database unavailable");
    tx.historyAccessGrant.create.mockRejectedValue(failure);
    await expect(useCase.execute("athlete", input)).rejects.toBe(failure);
  });
});
