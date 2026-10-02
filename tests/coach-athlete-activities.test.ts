/**
 * SAM-34 — the coach reads the athlete's activities (list + detail) in both
 * scopes, with the prescribed × executed outcome, and never beyond what the
 * athlete allowed.
 */
import { describe, expect, it, vi } from "vitest";
import { GetCoachAthleteActivities } from "@/modules/school/application/get-coach-athlete-activities";
import { GetCoachAthleteActivityDetail } from "@/modules/school/application/get-coach-athlete-activity-detail";
import { SchoolError } from "@/modules/school/domain/errors";

const NOW = new Date("2026-10-02T15:00:00.000Z");
const PERIOD_START = new Date("2026-09-01T00:00:00.000Z");
const INDEPENDENT = { kind: "independent" } as const;

function makeSchoolDb(overrides: Record<string, unknown> = {}) {
  return {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school", name: "Escola", status: "ACTIVE", timezone: "America/Sao_Paulo" }) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE", userId: "user" }) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "m" }) },
    schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue({ startedAt: PERIOD_START, createdAt: PERIOD_START }) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "athlete", name: "Ana", email: null, image: null }) },
    coachAthleteAssignment: {
      findFirst: vi.fn().mockImplementation((args: { where: Record<string, unknown> }) =>
        Promise.resolve(args.where.isPrimary === true ? { coachId: "coach", coach: { displayName: "C", user: { name: "C" } } } : { id: "own" })),
    },
    teamAthlete: { findMany: vi.fn().mockResolvedValue([]) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    historyAccessGrant: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    activity: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
    workoutExecution: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

function makeIndependentDb(overrides: Record<string, unknown> = {}) {
  return makeSchoolDb({
    school: { findUnique: vi.fn().mockRejectedValue(new Error("school table touched")) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE", userId: "user", acceptsIndependentAthletes: true, displayName: "Ricardo" }) },
    coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue({ id: "link", startedAt: PERIOD_START, coachId: "coach", coach: { displayName: "Ricardo", user: { name: "R" } } }) },
    notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) },
    ...overrides,
  });
}

const ACTIVITY = (overrides: Record<string, unknown> = {}) => ({
  id: "act-swim", name: "Serra Natação em alto mar", provider: "GARMIN", externalId: "g-swim", sportType: "open-water",
  startedAt: new Date("2026-10-02T10:00:00.000Z"), durationSeconds: 1477, movingSeconds: null, distanceMeters: 672,
  calories: 210, averageHeartRate: 140, averagePace: 220, averageSpeed: null, elevationGain: null, userId: "athlete",
  ...overrides,
});

describe("GetCoachAthleteActivities", () => {
  it("imported activity without execution is unplanned; one matched to this scope carries the prescription and the outcome", async () => {
    const bike = ACTIVITY({ id: "act-bike", name: "Bike", externalId: "g-bike", sportType: "bike", startedAt: new Date("2026-10-01T10:00:00.000Z") });
    const db = makeSchoolDb({
      activity: {
        findMany: vi.fn()
          .mockResolvedValueOnce([ACTIVITY(), bike])
          .mockResolvedValueOnce([{ sportType: "bike" }, { sportType: "open-water" }]),
        findUnique: vi.fn(),
      },
      workoutExecution: {
        findMany: vi.fn().mockResolvedValue([{
          id: "exec-1", activityId: "act-bike", source: "GARMIN", externalId: "g-bike", sportType: "bike",
          startedAt: bike.startedAt, durationSeconds: 2700, distanceMeters: 21000, averageHeartRate: 135, averageSpeed: 7.7,
          assignment: { id: "as-1", status: "COMPLETED", schoolId: "school", coachId: "coach", sourceLabel: null, workout: { title: "Bike 45", sportType: "bike" } },
        }]),
      },
    });

    const result = await new GetCoachAthleteActivities(db as never, () => NOW).execute("user", "school", "athlete", {});

    expect(result.items.map((item) => [item.id, item.outcome, item.prescription?.assignmentId ?? null])).toEqual([
      ["act-swim", "UNPLANNED_ACTIVITY", null],
      ["act-bike", "EXECUTED_AS_PLANNED", "as-1"],
    ]);
    expect(result.unplannedCount).toBe(1);
    expect(result.availableSportTypes).toEqual(["bike", "open-water"]);
    // The window, not the period, bounds the read; the period bounds what is shown.
    expect(db.activity.findMany.mock.calls[0][0].where.startedAt.gte).toEqual(new Date("2026-07-04T15:00:00.000Z"));
  });

  it("a prescription of another scope is neither unplanned nor shown; self-logged sessions are listed without a detail", async () => {
    const db = makeIndependentDb({
      activity: {
        // Two reads per execute (rows, then distinct modalities); the use case runs twice below.
        findMany: vi.fn().mockImplementation((args: { distinct?: unknown }) =>
          Promise.resolve(args.distinct ? [] : [ACTIVITY({ id: "act-other", externalId: "g-other" })])),
        findUnique: vi.fn(),
      },
      workoutExecution: {
        findMany: vi.fn().mockResolvedValue([
          { id: "exec-other", activityId: "act-other", source: "GARMIN", externalId: "g-other", sportType: "open-water", startedAt: new Date("2026-10-02T10:00:00.000Z"), durationSeconds: 1477, distanceMeters: 672, averageHeartRate: 140, averageSpeed: null,
            assignment: { id: "as-x", status: "COMPLETED", schoolId: "other-school", coachId: "other-coach", sourceLabel: null, workout: { title: "Deles", sportType: "open-water" } } },
          { id: "exec-self", activityId: null, source: "self-report", externalId: "x", sportType: "gym", startedAt: new Date("2026-10-01T19:00:00.000Z"), durationSeconds: 1800, distanceMeters: null, averageHeartRate: null, averageSpeed: null,
            assignment: { id: "as-self", status: "UNPLANNED", schoolId: null, coachId: null, sourceLabel: null, workout: { title: "Atividade registrada", sportType: "gym" } } },
        ]),
      },
    });

    const result = await new GetCoachAthleteActivities(db as never, () => NOW).execute("user", INDEPENDENT, "athlete", { origin: "todas" });

    expect(result.items.map((item) => [item.kind, item.id, item.outcome, item.prescription])).toEqual([
      ["imported", "act-other", null, null],
      ["self-logged", "exec-self", "UNPLANNED_ACTIVITY", null],
    ]);
    const unplanned = await new GetCoachAthleteActivities(db as never, () => NOW).execute("user", INDEPENDENT, "athlete", { origin: "nao-planejadas" });
    expect(unplanned.items.map((item) => item.id)).toEqual(["exec-self"]);
  });

  it("before the period without consent the row is withheld and counted, never listed", async () => {
    const db = makeSchoolDb({
      activity: {
        findMany: vi.fn().mockResolvedValueOnce([ACTIVITY({ id: "act-old", startedAt: new Date("2026-08-15T10:00:00.000Z") })]).mockResolvedValueOnce([]),
        findUnique: vi.fn(),
      },
    });

    const result = await new GetCoachAthleteActivities(db as never, () => NOW).execute("user", "school", "athlete", { days: 365 });

    expect(result.items).toEqual([]);
    expect(result.withheldBeforePeriod).toBe(1);
  });
});

describe("school administration (SAM-37)", () => {
  /** An OWNER with no CoachProfile: the hub gate would refuse, the school-admin scope must not. */
  function makeAdminDb(overrides: Record<string, unknown> = {}) {
    return makeSchoolDb({
      coachProfile: { findUnique: vi.fn().mockResolvedValue(null) },
      coachSchoolMembership: { findFirst: vi.fn().mockRejectedValue(new Error("coach membership touched")) },
      schoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "sm", schoolId: "school", userId: "owner", status: "ACTIVE", endedAt: null }) },
      schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ membershipId: "sm", role: "OWNER" }]) },
      coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue({ coachId: "coach", coach: { displayName: "Carlos", user: { name: "C" } } }) },
      ...overrides,
    });
  }

  it("the owner reads the athlete's activities with the school as scope and no coach", async () => {
    const db = makeAdminDb({
      activity: {
        findMany: vi.fn().mockImplementation((args: { distinct?: unknown }) => Promise.resolve(args.distinct ? [] : [ACTIVITY()])),
        findUnique: vi.fn(),
      },
    });

    const result = await new GetCoachAthleteActivities(db as never, () => NOW).execute("owner", { kind: "school-admin", schoolId: "school" }, "athlete", {});

    expect(result.context).toMatchObject({ reader: "school-admin", schoolId: "school", coachId: null, isResponsibleCoach: false, currentCoach: { name: "Carlos" } });
    expect(result.items.map((item) => [item.id, item.outcome])).toEqual([["act-swim", "UNPLANNED_ACTIVITY"]]);
  });

  it("an athlete without an ACTIVE membership in this school is not found; a non-manager is refused", async () => {
    const other = makeAdminDb({ schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(new GetCoachAthleteActivities(other as never, () => NOW).execute("owner", { kind: "school-admin", schoolId: "school" }, "athlete", {}))
      .rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND" });

    const stranger = makeAdminDb({ schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) }, schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) } });
    await expect(new GetCoachAthleteActivityDetail(stranger as never, () => NOW).execute("someone", { kind: "school-admin", schoolId: "school" }, "athlete", "act-swim"))
      .rejects.toBeInstanceOf(SchoolError);
  });

  it("the detail is read-only for the administration too", async () => {
    const loader = vi.fn().mockResolvedValue({ provider: "GARMIN", sportLabel: "Natação", startedAtLabel: "x", heroStats: [], overviewMetrics: [], barSections: [], metricSections: [] });
    const db = makeAdminDb({ activity: { findMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(ACTIVITY()) } });

    const result = await new GetCoachAthleteActivityDetail(db as never, () => NOW, loader).execute("owner", { kind: "school-admin", schoolId: "school" }, "athlete", "act-swim");

    expect(result.context.reader).toBe("school-admin");
    expect(result.outcome).toBe("UNPLANNED_ACTIVITY");
  });
});

describe("GetCoachAthleteActivityDetail", () => {
  it("returns the shared visual data read-only, with the outcome, and never touches any layout", async () => {
    const loader = vi.fn().mockResolvedValue({ provider: "GARMIN", sportLabel: "Natação", startedAtLabel: "x", heroStats: [], overviewMetrics: [], barSections: [], metricSections: [] });
    const userProfile = { update: vi.fn(), findUnique: vi.fn() };
    const db = makeIndependentDb({
      activity: { findMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(ACTIVITY()) },
      userProfile,
    });

    const result = await new GetCoachAthleteActivityDetail(db as never, () => NOW, loader).execute("user", INDEPENDENT, "athlete", "act-swim");

    expect(loader).toHaveBeenCalledWith(expect.objectContaining({ id: "act-swim" }));
    expect(result.outcome).toBe("UNPLANNED_ACTIVITY");
    expect(result.prescription).toBeNull();
    expect(result.visualData?.sportLabel).toBe("Natação");
    expect(userProfile.update).not.toHaveBeenCalled();
    // The link lookup accepts both spellings of the source and the explicit activityId.
    expect(db.workoutExecution.findFirst.mock.calls[0][0].where.OR).toEqual([
      { activityId: "act-swim" },
      { source: { in: ["GARMIN", "garmin"] }, externalId: "g-swim" },
    ]);
  });

  it("another athlete's activity, or one before the period without consent, is not found (no existence leak)", async () => {
    const other = makeSchoolDb({ activity: { findMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(ACTIVITY({ userId: "someone-else" })) } });
    await expect(new GetCoachAthleteActivityDetail(other as never, () => NOW).execute("user", "school", "athlete", "act-swim"))
      .rejects.toMatchObject({ code: "ACTIVITY_NOT_FOUND", status: 404 } satisfies Partial<SchoolError>);

    const old = makeSchoolDb({ activity: { findMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(ACTIVITY({ startedAt: new Date("2026-08-01T10:00:00.000Z") })) } });
    await expect(new GetCoachAthleteActivityDetail(old as never, () => NOW).execute("user", "school", "athlete", "act-swim"))
      .rejects.toMatchObject({ code: "ACTIVITY_NOT_FOUND" });
  });
});
