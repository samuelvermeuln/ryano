import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { RejectCoachSchoolMembership } from "@/modules/school/application/reject-coach-school-membership";
import { createCoachSchoolMembership, transitionCoachSchoolMembership, type CoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";

const startedAt = new Date("2026-09-09T12:00:00Z");
const now = new Date("2026-09-10T12:00:00Z");

function fixture() {
  let row: CoachSchoolMembership | null = createCoachSchoolMembership(
    { id: "period:opaque", coachId: "coach:opaque", schoolId: "school:opaque" }, startedAt,
  );
  const db = {
    school: { findUnique: vi.fn(async () => ({ id: "school:opaque", ownerUserId: "owner:opaque", status: "ACTIVE" }) as { id: string; ownerUserId: string; status: string } | null) },
    coachSchoolMembership: {
      findUnique: vi.fn(async () => row),
      update: vi.fn(async ({ data }: { data: Partial<CoachSchoolMembership> }) => {
        row = { ...row!, ...data };
        return row;
      }),
    },
  };
  const clock = vi.fn(() => now);
  return { db, clock, useCase: new RejectCoachSchoolMembership(db as never, clock), setRow: (value: CoachSchoolMembership | null) => { row = value; }, getRow: () => row! };
}

it("rejects only the pending coach period, preserving identity and prior timestamps [T051]", async () => {
  const { db, clock, useCase, getRow } = fixture();
  const prior = structuredClone(getRow());
  const result = await useCase.execute("owner:opaque", "school:opaque", "period:opaque");
  expect(result).toEqual({ ...prior, status: "REJECTED", decidedAt: now, endedAt: now, updatedAt: now });
  expect(db.coachSchoolMembership.update).toHaveBeenCalledExactlyOnceWith({
    where: { id: prior.id, status: "PENDING", updatedAt: startedAt },
    data: { status: "REJECTED", decidedAt: now, startedAt: null, endedAt: now, updatedAt: now },
  });
  expect(clock).toHaveBeenCalledTimes(1);
});

it.each([null, "", " ", " owner", "owner ", "x".repeat(257)])("rejects invalid actor %j before database access [T051]", async (actor) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute(actor, "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
});

it.each(["", " ", " target", "target ", "x".repeat(257)])("rejects malformed identifiers %j without persistence [T051]", async (invalid) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute("owner:opaque", invalid, "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  await expect(useCase.execute("owner:opaque", "school:opaque", invalid)).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.coachSchoolMembership.update).not.toHaveBeenCalled();
});

it("refuses a non-owner including global ADMIN and the coach themself [T051]", async () => {
  const { db, useCase } = fixture();
  for (const actor of ["global-admin", "coach:opaque", "other-owner"]) {
    await expect(useCase.execute(actor, "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  }
  expect(db.coachSchoolMembership.findUnique).not.toHaveBeenCalled();
  expect(db.coachSchoolMembership.update).not.toHaveBeenCalled();
});

it("returns school not found without touching memberships [T051]", async () => {
  const { db, useCase } = fixture();
  db.school.findUnique.mockResolvedValue(null);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  expect(db.coachSchoolMembership.findUnique).not.toHaveBeenCalled();
});

it.each(["absent", "other-school"])("hides %s membership and does not write [T051]", async (scenario) => {
  const { db, useCase, setRow, getRow } = fixture();
  setRow(scenario === "absent" ? null : { ...getRow(), schoolId: "other-school" });
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.coachSchoolMembership.update).not.toHaveBeenCalled();
});

it.each(["ACTIVE", "REJECTED", "ENDED", "REVOKED"] as const)("does not reject a %s period [T051]", async (status) => {
  const { db, useCase, setRow, getRow } = fixture();
  const pending = createCoachSchoolMembership({ id: "period:opaque", coachId: "coach:opaque", schoolId: "school:opaque" }, startedAt);
  setRow(status === "ACTIVE" || status === "REJECTED"
    ? transitionCoachSchoolMembership(pending, status, startedAt)
    : transitionCoachSchoolMembership(transitionCoachSchoolMembership(pending, "ACTIVE", startedAt), status, startedAt));
  const prior = structuredClone(getRow());
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_INVALID_TRANSITION", status: 409 });
  expect(getRow()).toEqual(prior);
  expect(db.coachSchoolMembership.update).not.toHaveBeenCalled();
});

it("reports concurrent changes as a stable conflict [T051]", async () => {
  const { db, useCase } = fixture();
  db.coachSchoolMembership.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Changed", { code: "P2025", clientVersion: "6" }));
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_CONFLICT", status: 409 });
});

it("preserves unexpected persistence errors [T051]", async () => {
  const { db, useCase } = fixture();
  const error = new Error("storage unavailable");
  db.coachSchoolMembership.update.mockRejectedValue(error);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toBe(error);
});

it.each([new Date(startedAt.getTime() - 1), new Date(Number.NaN)])("rejects an invalid end time %s without changing the period [T051]", async (invalidTime) => {
  const { db, clock, useCase, getRow } = fixture();
  const prior = structuredClone(getRow());
  clock.mockReturnValue(invalidTime);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toBeInstanceOf(ZodError);
  expect(getRow()).toEqual(prior);
  expect(db.coachSchoolMembership.update).not.toHaveBeenCalled();
});

it("returns not found when the period disappears before the transition read [T051]", async () => {
  const { db, useCase, getRow } = fixture();
  db.coachSchoolMembership.findUnique.mockResolvedValueOnce(getRow()).mockResolvedValueOnce(null);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.coachSchoolMembership.update).not.toHaveBeenCalled();
});
