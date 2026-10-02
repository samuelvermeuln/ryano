/**
 * SAM-35 — the roster loader serves both scopes, lists only ACTIVE links and
 * reads today's prescribed × executed state.
 */
import { describe, expect, it, vi } from "vitest";
import { loadCoachRoster, summarizeRoster } from "@/app/professor/_athlete-hub/roster";
import { INDEPENDENT_SCOPE, schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

const NOW = new Date("2026-10-02T15:00:00.000Z"); // sexta, 12:00 em São Paulo
const SP = "America/Sao_Paulo";
const TODAY_START = new Date("2026-10-02T03:00:00.000Z");
const TODAY_END = new Date("2026-10-03T03:00:00.000Z");

const ATHLETES = [
  { athleteId: "ana", athlete: { id: "ana", name: "Ana", email: "ana@x", image: null } },
  { athleteId: "bia", athlete: { id: "bia", name: "Bia", email: "bia@x", image: null } },
];

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    coachAthleteAssignment: { findMany: vi.fn().mockResolvedValue(ATHLETES) },
    workoutCompliance: { groupBy: vi.fn().mockResolvedValue([{ athleteId: "ana", _avg: { overallScore: 82 }, _count: 3 }]) },
    workoutExecution: {
      groupBy: vi.fn().mockResolvedValue([{ athleteId: "bia", _count: 2 }]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    workoutAssignment: {
      groupBy: vi.fn().mockResolvedValue([{ athleteId: "ana", _max: { scheduledAt: new Date("2026-09-30T10:00:00.000Z"), createdAt: new Date("2026-09-20T10:00:00.000Z") } }]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    teamAthlete: { findMany: vi.fn().mockResolvedValue([{ athleteId: "ana", team: { name: "Turma A" } }]) },
    activity: {
      groupBy: vi.fn().mockResolvedValue([{ userId: "ana", _max: { startedAt: new Date("2026-10-02T10:00:00.000Z") } }]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

describe("loadCoachRoster", () => {
  it("school scope: only ACTIVE links of this coach, prescription facts scoped to the school, today's window in the school's zone", async () => {
    const db = makeDb();

    const roster = await loadCoachRoster(db as never, { coachId: "coach", scope: schoolScope("school"), timeZone: SP, now: NOW });

    expect(db.coachAthleteAssignment.findMany.mock.calls[0][0].where).toEqual({ schoolId: "school", coachId: "coach", status: "ACTIVE", endedAt: null });
    expect(db.workoutCompliance.groupBy.mock.calls[0][0].where.assignment).toEqual({ schoolId: "school" });
    expect(db.activity.findMany.mock.calls[0][0].where.startedAt).toEqual({ gte: TODAY_START, lt: TODAY_END });
    expect(db.workoutAssignment.findMany.mock.calls[0][0].where.scheduledAt).toEqual({ gte: TODAY_START, lt: TODAY_END });

    const ana = roster.find((athlete) => athlete.id === "ana")!;
    expect(ana).toMatchObject({
      complianceAvg: 82, complianceCount: 3, pendingExecutions: 0, teamNames: ["Turma A"],
      lastPrescriptionLabel: "30/09/2026", daysSinceLastPrescription: 2,
      lastActivityLabel: "02/10/2026", daysSinceLastActivity: 0,
      activityToday: false, todayPrescription: null, unplannedToday: false,
    });
    expect(roster.find((athlete) => athlete.id === "bia")).toMatchObject({ pendingExecutions: 2, lastActivityLabel: null, teamNames: [] });
  });

  it("independent scope: `{ schoolId: null, coachId }` everywhere, no teams query", async () => {
    const db = makeDb();

    await loadCoachRoster(db as never, { coachId: "coach", scope: INDEPENDENT_SCOPE, timeZone: SP, now: NOW });

    expect(db.coachAthleteAssignment.findMany.mock.calls[0][0].where).toEqual({ schoolId: null, coachId: "coach", status: "ACTIVE", endedAt: null });
    expect(db.workoutCompliance.groupBy.mock.calls[0][0].where.assignment).toEqual({ schoolId: null, coachId: "coach" });
    expect(db.workoutAssignment.groupBy.mock.calls[0][0].where).toMatchObject({ schoolId: null, coachId: "coach" });
    expect(db.teamAthlete.findMany).not.toHaveBeenCalled();
  });

  it("today: bike prescribed and a swim imported → bike 'planned, not executed' and an unplanned activity today", async () => {
    const db = makeDb({
      workoutAssignment: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([
          { id: "as-bike", athleteId: "ana", status: "SCHEDULED", sourceLabel: null, workout: { title: "Bike 45", sportType: "bike" } },
        ]),
      },
      activity: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([{ id: "act-swim", userId: "ana", provider: "GARMIN", externalId: "g1" }]),
      },
    });

    const [ana] = await loadCoachRoster(db as never, { coachId: "coach", scope: schoolScope("school"), timeZone: SP, now: NOW });

    expect(ana.todayPrescription).toEqual({ assignmentId: "as-bike", title: "Bike 45", outcome: "PLANNED_NOT_EXECUTED" });
    expect(ana.activityToday).toBe(true);
    expect(ana.unplannedToday).toBe(true);
  });

  it("today: the matched activity makes the prescription 'as planned' and is not unplanned", async () => {
    const db = makeDb({
      workoutAssignment: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([
          { id: "as-bike", athleteId: "ana", status: "AVAILABLE", sourceLabel: null, workout: { title: "Bike 45", sportType: "bike" } },
        ]),
      },
      workoutExecution: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([
          { athleteId: "ana", activityId: "act-bike", source: "GARMIN", externalId: "g2", sportType: "bike", workoutAssignmentId: "as-bike", assignment: { status: "AVAILABLE" } },
        ]),
      },
      activity: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([{ id: "act-bike", userId: "ana", provider: "GARMIN", externalId: "g2" }]),
      },
    });

    const [ana] = await loadCoachRoster(db as never, { coachId: "coach", scope: schoolScope("school"), timeZone: SP, now: NOW });

    expect(ana.todayPrescription?.outcome).toBe("EXECUTED_AS_PLANNED");
    expect(ana.activityToday).toBe(true);
    expect(ana.unplannedToday).toBe(false);
  });

  it("no athletes: no further queries", async () => {
    const db = makeDb({ coachAthleteAssignment: { findMany: vi.fn().mockResolvedValue([]) } });
    expect(await loadCoachRoster(db as never, { coachId: "coach", scope: INDEPENDENT_SCOPE, timeZone: SP, now: NOW })).toEqual([]);
    expect(db.activity.findMany).not.toHaveBeenCalled();
  });
});

describe("summarizeRoster", () => {
  it("counts attention, confirmations, who trained today and the compliance average", () => {
    const base = { email: null, image: null, complianceCount: 0, lastPrescriptionLabel: null, teamNames: [], lastActivityLabel: null, daysSinceLastActivity: null, todayPrescription: null, unplannedToday: false };
    const summary = summarizeRoster([
      { ...base, id: "a", name: "A", complianceAvg: 80, pendingExecutions: 1, daysSinceLastPrescription: 2, activityToday: true },
      { ...base, id: "b", name: "B", complianceAvg: null, pendingExecutions: 0, daysSinceLastPrescription: null, activityToday: false },
      { ...base, id: "c", name: "C", complianceAvg: 60, pendingExecutions: 0, daysSinceLastPrescription: 20, activityToday: true },
    ]);
    expect(summary).toEqual({ needingAttention: 3, pendingConfirmations: 1, activeToday: 2, scoredCount: 2, rosterAverage: 70 });
  });
});
