import type { PrismaClient } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { ListHistoryGrants } from "@/modules/school/application/list-history-grants";
import { createHistoryAccessGrant } from "@/modules/school/domain/history-access-grant";

const now = new Date("2026-09-15T12:00:00Z");
const scope = { activities: true, metrics: false, prescribedWorkouts: false, compliance: false,
  coachScores: false, coachComments: false, assessments: false, athleteFeedback: false };
const grant = (id: string) => createHistoryAccessGrant({
  id, athleteId: "athlete", grantedBy: "athlete", granteeType: "SCHOOL", granteeId: "school",
  schoolId: "school", coachId: null, fromDate: null, toDate: null, scope,
}, now);
function setup() {
  const findMany = vi.fn().mockResolvedValue([]);
  const db = { historyAccessGrant: { findMany } } as unknown as PrismaClient;
  return { findMany, useCase: new ListHistoryGrants(db) };
}

it("lists only consent owned by the session athlete with bounded stable pagination [T111]", async () => {
  const { findMany, useCase } = setup();
  findMany.mockResolvedValue([grant("a"), grant("b"), grant("c")]);
  const page = await useCase.execute("athlete", { limit: "2" });
  expect(page.items.map(({ id }) => id)).toEqual(["a", "b"]);
  expect(page.nextCursor).toBe("b");
  expect(findMany).toHaveBeenCalledWith({
    where: { athleteId: "athlete", grantedBy: "athlete" }, orderBy: { id: "asc" }, take: 3,
  });
  findMany.mockResolvedValue([grant("c")]);
  expect(await useCase.execute("athlete", { limit: 2, cursor: page.nextCursor })).toEqual({
    items: [grant("c")], nextCursor: null,
  });
  expect(findMany).toHaveBeenLastCalledWith({
    where: { athleteId: "athlete", grantedBy: "athlete", id: { gt: "b" } }, orderBy: { id: "asc" }, take: 3,
  });
});

it("returns empty and revoked consent without hiding it from its owner [T111]", async () => {
  const { findMany, useCase } = setup();
  expect(await useCase.execute("athlete")).toEqual({ items: [], nextCursor: null });
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }));
  const revoked = { ...grant("a"), status: "REVOKED", revokedBy: "athlete", revokedAt: now };
  findMany.mockResolvedValue([revoked]);
  expect(await useCase.execute("athlete")).toEqual({ items: [revoked], nextCursor: null });
});

it.each([null, "", " athlete"])("rejects unauthenticated actor %j before queries [T111]", async (actor) => {
  const { findMany, useCase } = setup();
  await expect(useCase.execute(actor)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(findMany).not.toHaveBeenCalled();
});

it.each([{ athleteId: "victim" }, { grantedBy: "victim" }, { limit: 0 }, { limit: 101 },
  { limit: 1.5 }, { limit: "invalid" }, { cursor: "" }, { cursor: " padded" }])(
  "rejects owner injection or invalid pagination %j [T111]", async (query) => {
    const { findMany, useCase } = setup();
    await expect(useCase.execute("athlete", query)).rejects.toBeInstanceOf(ZodError);
    expect(findMany).not.toHaveBeenCalled();
  },
);

it("keeps the owner filter even for a cursor copied from another athlete [T111]", async () => {
  const { findMany, useCase } = setup();
  await useCase.execute("athlete", { cursor: "foreign-grant" });
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { athleteId: "athlete", grantedBy: "athlete", id: { gt: "foreign-grant" } },
  }));
});
