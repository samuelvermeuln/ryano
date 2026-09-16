import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { CheckHistoryAccess } from "@/modules/school/application/check-history-access";

const occurredAt = new Date("2020-12-31T23:59:59.999Z");
const request = { athleteId: "athlete", granteeType: "SCHOOL", granteeId: "school-b", category: "activities", occurredAt };

function setup() {
  const findFirst = vi.fn().mockResolvedValue(null);
  const db = { historyAccessGrant: { findFirst } };
  return { findFirst, useCase: new CheckHistoryAccess(db as unknown as PrismaClient) };
}

describe("CheckHistoryAccess [T107]", () => {
  it("requires exact recipient, athlete consent, active status, category and period in the database query", async () => {
    const { findFirst, useCase } = setup();
    findFirst.mockResolvedValue({ id: "grant" });
    await expect(useCase.execute(request)).resolves.toBe(true);
    const day = new Date("2020-12-31T00:00:00Z");
    expect(findFirst).toHaveBeenCalledExactlyOnceWith({
      where: {
        athleteId: "athlete", grantedBy: "athlete", granteeType: "SCHOOL", granteeId: "school-b",
        schoolId: "school-b", coachId: null, status: "ACTIVE", revokedBy: null, revokedAt: null,
        scope: { path: ["activities"], equals: true },
        AND: [
          { OR: [{ fromDate: null }, { fromDate: { lte: day } }] },
          { OR: [{ toDate: null }, { toDate: { gte: day } }] },
        ],
      },
      select: { id: true },
    });
  });

  it("checks an independent coach without relying on a school membership", async () => {
    const { findFirst, useCase } = setup();
    findFirst.mockResolvedValue({ id: "grant" });
    await expect(useCase.execute({ ...request, granteeType: "COACH", granteeId: "coach" })).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      granteeType: "COACH", granteeId: "coach", schoolId: null, coachId: "coach",
    }) }));
  });

  it("denies when no grant satisfies every condition and never returns grant or athlete data", async () => {
    const { findFirst, useCase } = setup();
    await expect(useCase.execute(request)).resolves.toBe(false);
    findFirst.mockResolvedValue({ id: "private-grant" });
    await expect(useCase.execute(request)).resolves.toBe(true);
    expect(findFirst.mock.calls.every(([query]) => Object.keys(query.select).join() === "id")).toBe(true);
  });

  it.each(["activities", "metrics", "prescribedWorkouts", "compliance", "coachScores",
    "coachComments", "assessments", "athleteFeedback"])("requires literal true for category %s", async (category) => {
    const { findFirst, useCase } = setup();
    await useCase.execute({ ...request, category });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      scope: { path: [category], equals: true },
    }) }));
  });

  it.each(["2020-12-31T00:00:00Z", "2020-12-31T23:59:59.999Z", "2021-01-01T00:00:00Z"])(
    "uses inclusive UTC calendar bounds for %s without mutating the supplied timestamp", async (timestamp) => {
      const { findFirst, useCase } = setup();
      const date = new Date(timestamp);
      await useCase.execute({ ...request, occurredAt: date });
      const day = new Date(`${timestamp.slice(0, 10)}T00:00:00Z`);
      expect(findFirst.mock.calls[0][0].where.AND).toEqual([
        { OR: [{ fromDate: null }, { fromDate: { lte: day } }] },
        { OR: [{ toDate: null }, { toDate: { gte: day } }] },
      ]);
      expect(date).toEqual(new Date(timestamp));
    },
  );

  it.each([null, {}, { ...request, athleteId: "" }, { ...request, granteeId: " school-b" },
    { ...request, granteeType: "ADMIN" }, { ...request, category: "all" },
    { ...request, category: "__proto__" }, { ...request, category: undefined },
    { ...request, occurredAt: new Date(NaN) }, { ...request, occurredAt: "2020-12-31" },
    { ...request, status: "ACTIVE" }, { ...request, scope: { activities: true } }])(
    "denies malformed or broadened requests before reading %j", async (raw) => {
      const { findFirst, useCase } = setup();
      await expect(useCase.execute(raw)).resolves.toBe(false);
      expect(findFirst).not.toHaveBeenCalled();
    },
  );

  it("never turns a persistence failure into permission", async () => {
    const { findFirst, useCase } = setup();
    const failure = new Error("database unavailable");
    findFirst.mockRejectedValue(failure);
    await expect(useCase.execute(request)).rejects.toBe(failure);
  });
});
