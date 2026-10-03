/**
 * SAM-62 — auditable and reversible prescription ↔ activity links (§2.2, §17.3, AC10).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/modules/school/application/can-read-athlete-current-data", () => ({
  CanReadAthleteCurrentData: class { execute() { return Promise.resolve(access.allowed); } },
}));
vi.mock("@/modules/school/application/calculate-workout-compliance", () => ({ triggerComplianceCalculation: vi.fn().mockResolvedValue(null) }));
beforeEach(() => { access.allowed = true; });

import { LinkActivityToAssignment } from "@/modules/school/application/match-audit";
import { markExecutionsRemovedAtProvider } from "@/modules/school/application/provider-removal";
import { notifyUnplannedActivity } from "@/modules/school/application/unplanned-activity-notice";
import { combineExecutions } from "@/modules/school/domain/execution-combination";
import { buildMatchDetail } from "@/modules/school/domain/workout-matching";
import { describeMatch } from "@/modules/school/presentation/match-explanation";
import { matchPanelModel } from "@/modules/school/presentation/match-panel-model";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const at = (iso: string) => new Date(iso);

describe("explicação do critério (§2.2)", () => {
  it("a tela diz o motivo: mesma modalidade, mesmo dia, duração e score", () => {
    const detail = buildMatchDetail({
      workout: { sportType: "run", scheduledDate: at("2026-10-03T00:00:00Z"), scheduledStartAt: null },
      prescribedDurationSeconds: 3600, prescribedDistanceMeters: null, blockCount: 1,
      activity: { source: "GARMIN", externalId: "g1", sportType: "run", providerSportType: "run", startedAt: at("2026-10-03T07:00:00Z"), durationSeconds: 3420 },
    });
    expect(detail.facts).toEqual({ sameSport: true, dayDifference: 0, durationRatio: 0.95, distanceRatio: null });
    expect(describeMatch({ matchMethod: "AUTO", matchDetail: detail, matchScore: detail.composite }))
      .toBe(`Associada automaticamente — mesma modalidade, mesmo dia, duração 95% (score ${detail.composite})`);
  });

  it("dia diferente aparece como tal; associação antiga sem detalhe não inventa critérios", () => {
    const detail = buildMatchDetail({
      workout: { sportType: "run", scheduledDate: at("2026-10-01T00:00:00Z"), scheduledStartAt: null },
      prescribedDurationSeconds: null, prescribedDistanceMeters: null, blockCount: 1,
      activity: { source: "GARMIN", externalId: "g1", sportType: "run", providerSportType: "run", startedAt: at("2026-10-03T07:00:00Z") },
    });
    expect(describeMatch({ matchMethod: "COACH", matchDetail: detail, matchScore: 1 })).toContain("Associada pelo professor — mesma modalidade, 2 dias depois do previsto");
    expect(describeMatch({ matchMethod: null, matchDetail: null, matchScore: 86 })).toBe("Associada automaticamente (score 86; critérios não registrados nesta associação)");
  });
});

describe("várias atividades da mesma sessão somam uma vez (§17.3)", () => {
  const piece = (id: string, start: string, durationSeconds: number, distanceMeters: number) => ({ id, startedAt: at(start), durationSeconds, distanceMeters });
  it("dois arquivos em sequência somam; a cópia sobreposta não conta de novo", () => {
    const combined = combineExecutions([
      piece("b", "2026-10-03T07:40:00Z", 1200, 4000),
      piece("a", "2026-10-03T07:00:00Z", 1800, 6000),
      piece("mirror", "2026-10-03T07:00:30Z", 1790, 5990),
    ])!;
    expect(combined.primary.id).toBe("a");
    expect(combined.pieces.map((p) => p.id)).toEqual(["a", "b"]);
    expect(combined.overlapping.map((p) => p.id)).toEqual(["mirror"]);
    expect(combined).toMatchObject({ durationSeconds: 3000, distanceMeters: 10000 });
    expect(combineExecutions([])).toBeNull();
  });
});

function makeDb(options: { activitySport?: string; elsewhere?: Array<Record<string, unknown>>; current?: Array<Record<string, unknown>>; existing?: Record<string, unknown> | null; coach?: boolean } = {}) {
  const history: Array<Record<string, unknown>> = [];
  const tx = {
    history,
    workoutAssignment: {
      findUnique: vi.fn().mockResolvedValue({
        id: "a1", athleteId: "maria", coachId: "coach-r", schoolId: null, status: "SCHEDULED", matchedActivityId: null,
        workout: { sportType: "open-water", scheduledDate: at("2026-10-03T00:00:00Z"), scheduledStartAt: null, blocks: [{ blockType: "STEADY", durationS: null, distanceM: 2000, repetitions: null, restPayload: null }] },
      }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ status: "SCHEDULED", matchedActivityId: null }),
      update: vi.fn().mockResolvedValue({}),
    },
    coachProfile: { findUnique: vi.fn().mockResolvedValue(options.coach ? { id: "coach-r" } : null) },
    activity: {
      findUnique: vi.fn().mockResolvedValue({
        id: "act-1", userId: "maria", provider: "GARMIN", externalId: "g-1", sportType: options.activitySport ?? "open-water",
        startedAt: at("2026-10-03T07:00:00Z"), durationSeconds: 2400, movingSeconds: null, distanceMeters: 1900, averageHeartRate: 140,
        maxHeartRate: 160, averageSpeed: null, elevationGain: null, averagePower: 210.6,
      }),
    },
    workoutExecution: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { workoutAssignmentId?: unknown } }) =>
        Promise.resolve(typeof where.workoutAssignmentId === "object" ? options.elsewhere ?? [] : options.current ?? [])),
      findFirst: vi.fn().mockImplementation(({ where }: { where: { matchStatus?: unknown } }) => Promise.resolve(where.matchStatus ? null : options.existing ?? null)),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Promise.resolve({ id: where.id, activityId: "act-1", matchScore: 90, ...data })),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(data)),
    },
    workoutAssignmentHistory: { create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => { history.push(data); return Promise.resolve(data); }) },
    $transaction: vi.fn(),
  };
  tx.$transaction.mockImplementation((fn: (client: unknown) => unknown) => fn(tx));
  return tx;
}

describe("LinkActivityToAssignment", () => {
  it("aluno associa: cria a execução com explicação, método e autor; trilha registra", async () => {
    const db = makeDb();
    await new LinkActivityToAssignment(db as never, () => NOW).execute("maria", { assignmentId: "a1", activityId: "act-1" });
    const data = db.workoutExecution.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ matchStatus: "OVERRIDDEN", matchMethod: "ATHLETE", matchedByUserId: "maria", activityId: "act-1", averagePower: 211 });
    expect(data.matchDetail).toMatchObject({ facts: { sameSport: true, dayDifference: 0, distanceRatio: 0.95 } });
    expect(db.history.map((entry) => entry.eventType)).toEqual(["MATCH_LINKED"]);
    expect(db.workoutAssignment.update.mock.calls.at(-1)![0].data).toMatchObject({ status: "AVAILABLE", matchedActivityId: "act-1" });
  });

  it("trocar desfaz a atual com trilha; atividade ligada a outra sessão é movida e a outra sessão registra", async () => {
    const current = [{ id: "e-old", workoutAssignmentId: "a1", activityId: "act-0", matchStatus: "AUTO_MATCHED", matchScore: 82 }];
    const elsewhere = [{ id: "e-b", workoutAssignmentId: "a2", activityId: "act-1", matchStatus: "CONFIRMED", matchScore: 70 }];
    const db = makeDb({ current, elsewhere });
    await new LinkActivityToAssignment(db as never, () => NOW).execute("maria", { assignmentId: "a1", activityId: "act-1", mode: "replace" });
    const unlinked = db.workoutExecution.update.mock.calls.map((call) => [call[0].where.id, call[0].data.unlinkReason]);
    expect(unlinked).toEqual([["e-b", "associada a outra sessão"], ["e-old", "substituída por outra atividade"]]);
    expect(db.history.map((entry) => [entry.workoutAssignmentId, entry.eventType])).toEqual([["a2", "MATCH_UNLINKED"], ["a1", "MATCH_UNLINKED"], ["a1", "MATCH_LINKED"]]);
  });

  it("somar mantém a atual; refazer reaproveita a mesma linha", async () => {
    const db = makeDb({ current: [{ id: "e-1", workoutAssignmentId: "a1", activityId: "act-0", matchStatus: "CONFIRMED", matchScore: 90 }], existing: { id: "e-prev" } });
    await new LinkActivityToAssignment(db as never, () => NOW).execute("maria", { assignmentId: "a1", activityId: "act-1", mode: "add" });
    expect(db.workoutExecution.create).not.toHaveBeenCalled();
    expect(db.workoutExecution.update).toHaveBeenCalledTimes(1);
    expect(db.workoutExecution.update.mock.calls[0][0]).toMatchObject({ where: { id: "e-prev" }, data: { unlinkedAt: null, matchMethod: "ATHLETE" } });
    expect(db.history[0]).toMatchObject({ eventType: "MATCH_LINKED", payload: expect.objectContaining({ mode: "add" }) });
  });

  it("outra modalidade: aluno não associa (decisão do professor); professor associa", async () => {
    await expect(new LinkActivityToAssignment(makeDb({ activitySport: "run" }) as never, () => NOW).execute("maria", { assignmentId: "a1", activityId: "act-1" }))
      .rejects.toMatchObject({ code: "OTHER_SPORT_COACH_DECIDES", status: 422 });
    const db = makeDb({ activitySport: "run", coach: true });
    await new LinkActivityToAssignment(db as never, () => NOW).execute("ricardo", { assignmentId: "a1", activityId: "act-1" });
    expect(db.workoutExecution.create.mock.calls[0][0].data).toMatchObject({ matchMethod: "COACH", matchedByUserId: "ricardo" });
    expect(db.history[0]!.payload).toMatchObject({ otherSport: true, method: "COACH" });
  });

  it("autorização: professor sem vínculo atual e estranho não associam", async () => {
    access.allowed = false;
    await expect(new LinkActivityToAssignment(makeDb({ coach: true }) as never, () => NOW).execute("ricardo", { assignmentId: "a1", activityId: "act-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(new LinkActivityToAssignment(makeDb() as never, () => NOW).execute("carlos", { assignmentId: "a1", activityId: "act-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("painel e políticas", () => {
  it("o painel mostra explicação, desfeita com motivo, soma e trilha com autor", () => {
    const base = { matchScore: 86, matchDetail: null, matchMethod: "AUTO", source: "GARMIN", sportType: "run", durationSeconds: 1800, distanceMeters: 5000, activityId: "x", providerRemovedAt: null, unlinkReason: null, unlinkedAt: null };
    const model = matchPanelModel({
      executions: [
        { ...base, id: "e1", matchStatus: "CONFIRMED", startedAt: at("2026-10-03T07:00:00Z") },
        { ...base, id: "e2", matchStatus: "OVERRIDDEN", matchMethod: "ATHLETE", startedAt: at("2026-10-03T07:40:00Z"), providerRemovedAt: NOW },
        { ...base, id: "e3", matchStatus: "NO_MATCH", startedAt: at("2026-10-03T09:00:00Z"), unlinkedAt: NOW, unlinkReason: "não era" },
      ],
      history: [
        { id: "h1", eventType: "MATCH_LINKED", payload: { automatic: true, method: "AUTO", score: 86 }, createdAt: NOW, actor: { name: "Maria" } },
        { id: "h2", eventType: "MATCH_UNLINKED", payload: { reason: "não era" }, createdAt: NOW, actor: { name: "Ricardo" } },
      ],
    });
    expect(model.combined).toMatchObject({ pieces: 2, durationSeconds: 3600, distanceMeters: 10000 });
    expect(model.links[1]).toMatchObject({ providerRemoved: true });
    expect(model.links[2]).toMatchObject({ unlinked: { reason: "não era" } });
    expect(model.history.map((entry) => `${entry.label} · ${entry.actorName}`)).toEqual(["Associada automaticamente (score 86) · Ryvano", "Associação desfeita — não era · Ricardo"]);
  });

  it("exclusão no provedor marca a execução, não apaga", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await markExecutionsRemovedAtProvider({ workoutExecution: { updateMany } } as never, { userId: "maria", provider: "STRAVA", externalId: "s-1" }, NOW);
    expect(updateMany).toHaveBeenCalledWith({
      where: { athleteId: "maria", externalId: "s-1", source: { in: ["STRAVA", "strava"] }, providerRemovedAt: null },
      data: { providerRemovedAt: NOW },
    });
  });

  it("atividade extra recente avisa os professores atuais uma vez; antiga (backfill) não", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      coachAthleteAssignment: { findMany: vi.fn().mockResolvedValue([{ schoolId: null, coach: { userId: "ricardo" }, athlete: { name: "Maria" } }]) },
      userNotification: { createMany },
    };
    expect(await notifyUnplannedActivity(db as never, { id: "act-9", userId: "maria", sportType: "run", startedAt: at("2026-10-02T07:00:00Z") }, NOW)).toBe(1);
    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({ userId: "ricardo", kind: "UNPLANNED_ACTIVITY", dedupeKey: "unplanned:act-9", href: "/professor/independente/atletas/maria/atividades/act-9" });
    expect(await notifyUnplannedActivity(db as never, { id: "old", userId: "maria", sportType: "run", startedAt: at("2026-09-01T07:00:00Z") }, NOW)).toBe(0);
  });
});
