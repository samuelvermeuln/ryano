/**
 * SAM-33 — uma única definição de "atividade não planejada".
 */
import { describe, expect, it, vi } from "vitest";
import {
  activityLinkKey,
  isActivityLinked,
  linkedActivityKeys,
  listUnplannedActivities,
  splitLinkedActivities,
} from "@/modules/school/application/unplanned-activities";

const EXECUTIONS = [
  { activityId: "act-1", source: "GARMIN", externalId: "g1" },
  { activityId: null, source: "strava", externalId: "s9" }, // legado: só o par (source, externalId)
];

const ACTIVITIES = [
  { id: "act-1", provider: "GARMIN", externalId: "g1" },
  { id: "act-2", provider: "STRAVA", externalId: "s9" },
  { id: "act-3", provider: "STRAVA", externalId: "s10" },
];

describe("splitLinkedActivities", () => {
  it("liga pelo activityId explícito e pelo par legado, sem distinguir caixa do provider", () => {
    expect(activityLinkKey("strava", "s9")).toBe("STRAVA:s9");
    const keys = linkedActivityKeys(EXECUTIONS);
    expect(isActivityLinked(ACTIVITIES[0], keys)).toBe(true);
    expect(isActivityLinked(ACTIVITIES[1], keys)).toBe(true);
    expect(isActivityLinked(ACTIVITIES[2], keys)).toBe(false);

    const { linked, unlinked } = splitLinkedActivities(EXECUTIONS, ACTIVITIES);
    expect(linked.map((a) => a.id)).toEqual(["act-1", "act-2"]);
    expect(unlinked.map((a) => a.id)).toEqual(["act-3"]);
  });

  it("sem execuções, toda atividade é não planejada", () => {
    expect(splitLinkedActivities([], ACTIVITIES).unlinked).toHaveLength(3);
  });
});

describe("listUnplannedActivities", () => {
  it("só considera execuções casadas e devolve as atividades que nenhuma delas aponta", async () => {
    const db = {
      workoutExecution: { findMany: vi.fn().mockResolvedValue(EXECUTIONS) },
      activity: { findMany: vi.fn().mockResolvedValue(ACTIVITIES) },
    };
    const from = new Date("2026-09-28T03:00:00.000Z");
    const until = new Date("2026-10-05T03:00:00.000Z");

    const rows = await listUnplannedActivities(db as never, { athleteId: "ath", from, until, sportType: "swim" });

    expect(rows.map((a) => a.id)).toEqual(["act-3"]);
    const executionWhere = db.workoutExecution.findMany.mock.calls[0][0].where;
    expect(executionWhere.matchStatus).toEqual({ in: ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] });
    expect(executionWhere.startedAt).toEqual({ gte: from, lt: until });
    expect(db.activity.findMany.mock.calls[0][0].where).toEqual({ userId: "ath", startedAt: { gte: from, lt: until }, sportType: "swim" });
  });
});
