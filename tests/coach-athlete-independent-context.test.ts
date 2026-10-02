import { describe, expect, it, vi } from "vitest";
import {
  isInPrescriptionScope,
  prescriptionScope,
  technicalSheetScope,
  toCoachAthleteScope,
} from "@/modules/school/application/coach-athlete-scope";
import { resolveAthleteTimeZone } from "@/modules/school/application/athlete-time-zone";
import { ResolveCoachAthleteContext } from "@/modules/school/application/resolve-coach-athlete-context";

/**
 * SAM-30 — the same gate opens an INDEPENDENT athlete (coaching link with no
 * school). What is under test: the scope helpers never produce `{ schoolId:
 * null }` alone (that NULL is shared with marketplace and self-logged rows),
 * the school shape is byte-for-byte what it was, and the independent branch of
 * the gate resolves from the coach's own ACTIVE link — refusing a PENDING one,
 * a missing one, or an inactive coach — without touching any school table.
 */
const NOW = new Date("2026-10-01T15:00:00.000Z");
const LINK_START = new Date("2026-09-20T12:00:00.000Z");

describe("coach-athlete-scope — the shapes the queries are built from", () => {
  it("treats a plain string as the school scope (the pre-SAM-30 call shape)", () => {
    expect(toCoachAthleteScope("school")).toEqual({ kind: "school", schoolId: "school" });
    expect(toCoachAthleteScope({ kind: "independent" })).toEqual({ kind: "independent" });
  });

  it("builds the school scope as exactly { schoolId } — no extra keys", () => {
    expect(prescriptionScope({ schoolId: "school", coachId: "coach" })).toEqual({ schoolId: "school" });
    expect(Object.keys(prescriptionScope({ schoolId: "school", coachId: "coach" }))).toEqual(["schoolId"]);
  });

  it("never builds the independent scope as { schoolId: null } alone", () => {
    expect(prescriptionScope({ schoolId: null, coachId: "coach" })).toEqual({ schoolId: null, coachId: "coach" });
  });

  it("decides in memory the same way: another independent coach's row is out of scope", () => {
    const independent = { schoolId: null, coachId: "coach" };
    expect(isInPrescriptionScope({ schoolId: null, coachId: "coach" }, independent)).toBe(true);
    expect(isInPrescriptionScope({ schoolId: null, coachId: "other" }, independent)).toBe(false);
    // A marketplace-licence row has no coach at all.
    expect(isInPrescriptionScope({ schoolId: null, coachId: null }, independent)).toBe(false);
    expect(isInPrescriptionScope({ schoolId: "school", coachId: "coach" }, independent)).toBe(false);

    const school = { schoolId: "school", coachId: "coach" };
    expect(isInPrescriptionScope({ schoolId: "school", coachId: "someone-else" }, school)).toBe(true);
    expect(isInPrescriptionScope({ schoolId: null, coachId: "coach" }, school)).toBe(false);
  });

  it("keys the technical sheet by school inside one and by coach outside", () => {
    expect(technicalSheetScope({ schoolId: "school", coachId: "coach" }, "athlete"))
      .toEqual({ kind: "school", where: { schoolId: "school", athleteId: "athlete" } });
    expect(technicalSheetScope({ schoolId: null, coachId: "coach" }, "athlete"))
      .toEqual({ kind: "independent", where: { schoolId: null, coachId: "coach", athleteId: "athlete" } });
  });
});

describe("resolveAthleteTimeZone", () => {
  it("uses the athlete's notification preference when it is a valid IANA zone", async () => {
    const db = { notificationPreference: { findUnique: vi.fn().mockResolvedValue({ timezone: "Europe/Lisbon" }) } };
    await expect(resolveAthleteTimeZone(db as never, "athlete")).resolves.toBe("Europe/Lisbon");
  });

  it("falls back to the platform default without a preference or with garbage", async () => {
    const none = { notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) } };
    const bad = { notificationPreference: { findUnique: vi.fn().mockResolvedValue({ timezone: "Mars/Olympus" }) } };
    await expect(resolveAthleteTimeZone(none as never, "athlete")).resolves.toBe("America/Sao_Paulo");
    await expect(resolveAthleteTimeZone(bad as never, "athlete")).resolves.toBe("America/Sao_Paulo");
  });
});

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    coachProfile: {
      findUnique: vi.fn().mockResolvedValue({
        id: "coach", status: "ACTIVE", displayName: "Prof. Carlos", acceptsIndependentAthletes: true, user: { name: "Carlos" },
      }),
    },
    // Answers both the gate's own lookup and `CanReadAthleteCurrentData`'s.
    coachAthleteAssignment: {
      findFirst: vi.fn().mockResolvedValue({ id: "link", startedAt: LINK_START, createdAt: LINK_START }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "athlete", name: "Samuel", email: "samuel@example.com", image: null }),
    },
    notificationPreference: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
    // School tables must stay untouched: a throwing delegate makes any call fail loudly.
    school: { findUnique: vi.fn().mockRejectedValue(new Error("school table touched")) },
    coachSchoolMembership: { findFirst: vi.fn().mockRejectedValue(new Error("coach membership touched")) },
    schoolAthleteMembership: { findFirst: vi.fn().mockRejectedValue(new Error("athlete membership touched")) },
    teamAthlete: { findMany: vi.fn().mockRejectedValue(new Error("teams touched")) },
    ...overrides,
  };
}

const INDEPENDENT = { kind: "independent" } as const;

function resolve(db: unknown) {
  return new ResolveCoachAthleteContext(db as never, () => NOW);
}

describe("ResolveCoachAthleteContext — independent coaching", () => {
  it("resolves the athlete from the coach's own ACTIVE independent link", async () => {
    const db = makeDb();

    const context = await resolve(db).execute("user", INDEPENDENT, "athlete");

    expect(context).toMatchObject({
      coachId: "coach",
      schoolId: null,
      schoolName: null,
      timeZone: "America/Sao_Paulo",
      periodStart: LINK_START,
      teams: [],
      isResponsibleCoach: true,
      acceptsIndependentAthletes: true,
      currentCoach: { coachId: "coach", name: "Prof. Carlos" },
    });
    expect(context.athlete.name).toBe("Samuel");
    // The link lookup is pinned to this coach, this athlete, no school, ACTIVE.
    expect(db.coachAthleteAssignment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ athleteId: "athlete", coachId: "coach", schoolId: null, status: "ACTIVE" }),
    }));
    expect(db.school.findUnique).not.toHaveBeenCalled();
    expect(db.schoolAthleteMembership.findFirst).not.toHaveBeenCalled();
  });

  it("reads the calendar zone from the athlete's preference", async () => {
    const db = makeDb({ notificationPreference: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Manaus" }) } });

    const context = await resolve(db).execute("user", INDEPENDENT, "athlete");

    expect(context.timeZone).toBe("America/Manaus");
  });

  it("refuses when there is no ACTIVE independent link (a PENDING proposal is not one)", async () => {
    const db = makeDb({ coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue(null) } });

    await expect(resolve(db).execute("user", INDEPENDENT, "athlete"))
      .rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND", status: 404 });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a coach whose profile is not active", async () => {
    const db = makeDb({
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "SUSPENDED", acceptsIndependentAthletes: true }) },
    });

    await expect(resolve(db).execute("user", INDEPENDENT, "athlete"))
      .rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND" });
  });

  it("refuses an actor with no coach profile at all", async () => {
    const db = makeDb({ coachProfile: { findUnique: vi.fn().mockResolvedValue(null) } });

    await expect(resolve(db).execute("user", INDEPENDENT, "athlete"))
      .rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND" });
  });

  it("requires a signed-in actor", async () => {
    await expect(resolve(makeDb()).execute(null, INDEPENDENT, "athlete"))
      .rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("still resolves a school scope passed as a plain string through the school branch", async () => {
    // The pre-SAM-30 shape: every school caller passes the id; the independent
    // fixture refuses school tables, so reaching one proves the branch taken.
    await expect(resolve(makeDb()).execute("user", "school", "athlete"))
      .rejects.toThrow("school table touched");
  });
});
