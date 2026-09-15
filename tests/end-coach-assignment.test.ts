import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { EndCoachAssignment } from "@/modules/school/application/end-coach-assignment";

const started = new Date("2026-09-11T10:00:00Z");
const now = new Date("2026-09-11T11:00:00Z");
function setup(status = "ACTIVE", schoolId: string | null = "school") {
  const row = { id: "assignment", schoolId, athleteId: "athlete", coachId: "coach", status, isPrimary: true, sportType: null, startedAt: started, endedAt: status === "ENDED" ? now : null, assignedBy: "owner", endedBy: null, createdAt: started, updatedAt: now };
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }));
  const db = { school: { findUnique: vi.fn(async () => ({ id: "school", ownerUserId: "owner" })) }, coachAthleteAssignment: { findUnique: vi.fn(async () => row), update } };
  return { db, update, useCase: new EndCoachAssignment(db as never, () => now) };
}
it("ends only the assignment and records actor with optimistic concurrency [T066]", async () => {
  const { useCase, update } = setup();
  expect(await useCase.execute("owner", "school", "assignment")).toMatchObject({ status: "ENDED", endedAt: now, endedBy: "owner" });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "assignment", status: "ACTIVE", updatedAt: now } }));
});
it("rejects unauthenticated and unrelated actors [T066]", async () => {
  const { useCase, update } = setup();
  await expect(useCase.execute(null, "school", "assignment")).rejects.toMatchObject({ status: 401 });
  await expect(useCase.execute("outsider", "school", "assignment")).rejects.toMatchObject({ status: 403 });
  expect(update).not.toHaveBeenCalled();
});
it.each(["other-school", null])("hides assignments outside school %s [T066]", async (scope) => {
  const { useCase, update } = setup("ACTIVE", scope);
  await expect(useCase.execute("owner", "school", "assignment")).rejects.toMatchObject({ status: 404 });
  expect(update).not.toHaveBeenCalled();
});
it("rejects closed periods and maps concurrent changes [T066]", async () => {
  await expect(setup("ENDED").useCase.execute("owner", "school", "assignment")).rejects.toMatchObject({ status: 409 });
  const { useCase, update } = setup();
  update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2025", clientVersion: "test" }));
  await expect(useCase.execute("owner", "school", "assignment")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409 });
});
