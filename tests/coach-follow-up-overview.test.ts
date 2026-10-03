/**
 * SAM-67 — coach panel counters (§19.2) and the athlete calendar overlay.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/school/application/sport-events", () => ({ resolveEventActor: vi.fn().mockResolvedValue({ kind: "coach", schoolId: null }) }));

import { GetCoachFollowUpOverview, OVERVIEW_LISTS } from "@/modules/school/application/coach-follow-up-overview";
import { loadAthleteCalendarOverlay } from "@/modules/school/application/athlete-calendar-overlay";

const NOW = new Date("2026-10-03T12:00:00.000Z");

function makeDb() {
  const participation = { id: "p1", athleteId: "maria", athlete: { name: "Maria" }, event: { name: "Travessia", startLocalDate: "2026-12-20" } };
  return {
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-r" }) },
    coachAthleteAssignment: { findMany: vi.fn().mockResolvedValue([{ athleteId: "maria", schoolId: null }]) },
    eventPreparation: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { status?: string } }) =>
        Promise.resolve(where.status === "REVIEW_PENDING" ? [] : [{ id: where.status ? "prep-await" : "prep-new", schoolId: null, participation }])),
    },
    activity: { findMany: vi.fn().mockResolvedValue([{ id: "act-1", userId: "maria", name: null, sportType: "ride", startedAt: NOW, user: { name: "Maria" } }]) },
    workoutAssignment: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { reviews?: unknown } }) =>
        Promise.resolve([{ id: where.reviews ? "a-review" : "a-norecord", athleteId: "maria", schoolId: null, scheduledAt: NOW, workout: { title: "Rodagem" }, athlete: { name: "Maria" } }])),
    },
  };
}

describe("GetCoachFollowUpOverview", () => {
  it("conta cada grupo com definição e leva à lista no contexto certo; marcos não são inventados", async () => {
    const db = makeDb();
    const overview = await new GetCoachFollowUpOverview(db as never, () => NOW).execute("ricardo", { schoolId: null, days: 7 });
    expect(overview.counters.map((counter) => [counter.list, counter.count])).toEqual([
      ["novos-eventos", 1], ["sem-analise", 1], ["marcos", 0], ["extras", 1], ["revisoes", 1], ["sem-registro", 1],
    ]);
    expect(overview.counters.every((counter) => counter.definition.length > 10)).toBe(true);
    expect(overview.lists["novos-eventos"][0]!.href).toBe("/professor/independente/atletas/maria/eventos/p1");
    expect(overview.lists.extras[0]!.href).toBe("/professor/independente/atletas/maria/atividades/act-1");
    expect(overview.lists["sem-registro"][0]!.href).toBe("/professor/independente/atletas/maria/treinos/a-norecord");
    expect(OVERVIEW_LISTS).toHaveLength(6);
  });

  it("período e escola entram nos filtros; quem não é professor não vê", async () => {
    const db = makeDb();
    await new GetCoachFollowUpOverview(db as never, () => NOW).execute("ricardo", { schoolId: "alpha", days: 30 });
    const where = db.eventPreparation.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ coachId: "coach-r", schoolId: "alpha", participation: { createdAt: { gte: new Date(NOW.getTime() - 30 * 86_400_000) } } });
    db.coachProfile.findUnique.mockResolvedValue(null);
    await expect(new GetCoachFollowUpOverview(db as never, () => NOW).execute("maria", { days: 7 })).rejects.toMatchObject({ status: 403 });
  });
});

describe("loadAthleteCalendarOverlay", () => {
  it("eventos (prova principal marcada), metas e indisponibilidade do período, com a referência de zonas", async () => {
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue({ name: "Maria" }) },
      athleteEventParticipation: { findMany: vi.fn().mockResolvedValue([{ id: "p1", suggestedPriority: "SECONDARY", agreedPriority: "MAIN", event: { name: "Travessia", startLocalDate: "2026-10-05" }, option: { label: "2 km" } }]) },
      athleteGoal: { findMany: vi.fn().mockResolvedValue([{ id: "g1", description: "concluir com controle", dueLocalDate: "2026-10-04", origin: "COACH_AGREED" }]) },
      athleteUnavailability: { findMany: vi.fn().mockResolvedValue([{ id: "u1", startLocalDate: "2026-10-06", endLocalDate: "2026-10-07", reason: "viagem" }]) },
      athleteTechnicalSheet: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const overlay = await loadAthleteCalendarOverlay(db as never, "ricardo", "maria", { from: "2026-09-28", to: "2026-10-04" }, () => NOW);
    expect(overlay.events[0]).toMatchObject({ name: "Travessia", main: true, option: "2 km" });
    expect(overlay.goals[0]).toMatchObject({ agreed: true });
    expect(overlay.unavailability).toHaveLength(1);
    expect(overlay.zonesReference).toContain("Sem ficha técnica");
  });
});
