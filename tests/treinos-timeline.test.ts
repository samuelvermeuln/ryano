/**
 * SAM-41 — o calendário do atleta nunca mostra a mesma sessão duas vezes: a
 * atividade importada que uma execução casada já representa some do lado das
 * atividades; a que ninguém casou vira "Não planejada".
 */
import { describe, expect, it } from "vitest";
import {
  executionLinksOf,
  groupTimelineByDay,
  mergeTimelineItems,
  unmatchedActivities,
} from "@/app/app/(atleta)/treinos/timeline";
import type { ActivityListItem, AssignmentWithDetails } from "@/app/app/(atleta)/treinos/queries";

function assignment(id: string, scheduledAt: string, executions: Array<{ activityId: string | null; source: string; externalId: string }>): AssignmentWithDetails {
  return {
    id, scheduledAt: new Date(scheduledAt), status: "COMPLETED",
    executions: executions.map((execution) => ({ id: `exec-${execution.externalId}`, durationSeconds: null, movingSeconds: null, distanceMeters: null, averageHeartRate: null, averageSpeed: null, elevationGain: null, sportType: "run", ...execution })),
  } as unknown as AssignmentWithDetails;
}

function activity(id: string, startedAt: string, provider: string, externalId: string): ActivityListItem {
  return { id, name: null, sportType: "run", startedAt: new Date(startedAt), durationSeconds: 1800, distanceMeters: 5000, provider: provider as ActivityListItem["provider"], externalId };
}

describe("unmatchedActivities / mergeTimelineItems", () => {
  const matchedById = assignment("as-1", "2026-10-02T07:00:00.000Z", [{ activityId: "act-1", source: "GARMIN", externalId: "g-1" }]);
  const matchedByExternal = assignment("as-2", "2026-10-03T07:00:00.000Z", [{ activityId: null, source: "strava", externalId: "s-2" }]);
  const rows = [
    activity("act-1", "2026-10-02T07:05:00.000Z", "GARMIN", "g-1"),
    activity("act-2", "2026-10-03T07:05:00.000Z", "STRAVA", "s-2"),
    activity("act-3", "2026-10-04T07:05:00.000Z", "GARMIN", "g-3"),
  ];

  it("casada por activityId ou pelo par (fonte, externalId) não vira card de atividade; a não casada sim", () => {
    const links = executionLinksOf([matchedById, matchedByExternal]);
    expect(unmatchedActivities(links, rows).map((row) => row.id)).toEqual(["act-3"]);
  });

  it("a lista intercala prescrições e só as atividades não planejadas, em ordem cronológica", () => {
    const items = mergeTimelineItems([matchedById, matchedByExternal], rows);
    expect(items.map((item) => `${item.kind}:${item.data.id}`)).toEqual(["assignment:as-1", "assignment:as-2", "activity:act-3"]);
    expect(groupTimelineByDay(items).map((group) => group.items.length)).toEqual([1, 1, 1]);
  });
});
