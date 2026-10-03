/**
 * SAM-66 — event result and post-event (§5.3, §6 step 13, §12.6, §16.6, AC20, AC25).
 */
import { describe, expect, it, vi } from "vitest";

import { RecordParticipationResult } from "@/modules/school/application/participation-results";
import { syncParticipationReminders } from "@/modules/school/application/follow-up-reminders";
import { goalVersusResult, parseDurationText, participationResultInputSchema } from "@/modules/school/domain/participation-result";

const NOW = new Date("2026-12-21T12:00:00.000Z");

describe("regras do resultado", () => {
  it("abandono com segmento; tempo final só para quem concluiu; tempo oficial exige origem", () => {
    expect(participationResultInputSchema.parse({ status: "DNF", abandonSegment: "Corrida, após a bike", abandonReason: "cãibra" })).toMatchObject({ status: "DNF", abandonSegment: "Corrida, após a bike" });
    expect(() => participationResultInputSchema.parse({ status: "DNF", reportedTimeSeconds: 3600 })).toThrow(/Tempo final/);
    expect(() => participationResultInputSchema.parse({ status: "FINISHED", officialTimeSeconds: 3600 })).toThrow(/origem do tempo oficial/);
    expect(() => participationResultInputSchema.parse({ status: "FINISHED", abandonSegment: "bike" })).toThrow(/abandonou/);
    expect(parseDurationText("1:02:30")).toBe(3750);
    expect(parseDurationText("45")).toBe(2700);
  });

  it("objetivo × resultado sem rótulo de sucesso/fracasso; tempos oficial e relatado com origem", () => {
    const view = goalVersusResult("Concluir com controle (pactuado)", { status: "FINISHED", officialTimeSeconds: null, reportedTimeSeconds: 3750 });
    expect(view.result).toBe("Concluiu em 1:02:30 (relatado)");
    expect(`${view.goal} ${view.result}`).not.toMatch(/sucesso|fracasso/i);
    expect(view.note).toContain("recorde pessoal não comprova sozinho");
  });
});

function makeDb(options: { participation?: Record<string, unknown>; startLocalDate?: string; actorIsAthlete?: boolean } = {}) {
  const writes: string[] = [];
  const db = {
    writes,
    athleteEventParticipation: {
      findUnique: vi.fn().mockResolvedValue({
        id: "p1", athleteId: "maria", status: "REGISTERED",
        event: { startLocalDate: options.startLocalDate ?? "2026-12-20", endLocalDate: null, dateConfirmed: true, timeZone: "America/Sao_Paulo", status: "CONFIRMED", name: "Triathlon" },
        preparation: { id: "prep1", status: "ACTIVE", coachId: "coach-r", schoolId: null, createdAt: NOW },
        result: null,
        ...options.participation,
      }),
      update: vi.fn().mockImplementation(() => { writes.push("participation.update"); return Promise.resolve({}); }),
    },
    participationResult: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => { writes.push("result.create"); return Promise.resolve(data); }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => { writes.push("result.update"); return Promise.resolve(data); }),
    },
    eventPreparation: { update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => { writes.push(`preparation.${String(data.status)}`); return Promise.resolve({}); }) },
    eventPreparationTransition: { create: vi.fn().mockResolvedValue({}) },
    activity: { deleteMany: vi.fn(), update: vi.fn() },
    workoutExecution: { deleteMany: vi.fn(), update: vi.fn() },
    coachAthleteAssignment: { findMany: vi.fn().mockResolvedValue([{ coachId: "coach-r", schoolId: null, coach: { userId: "ricardo" } }]) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-r" }) },
    schoolMembership: { findMany: vi.fn().mockResolvedValue([]) },
    followUpPolicy: { findUnique: vi.fn().mockResolvedValue(null) },
    scheduledReminder: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (client: unknown) => unknown) => fn(db));
  return db;
}

vi.mock("@/modules/school/application/sport-events", () => ({
  resolveEventActor: vi.fn((_db: unknown, _clock: unknown, actorUserId: string, athleteId: string) =>
    Promise.resolve(actorUserId === athleteId ? { kind: "athlete" } : { kind: "coach", schoolId: null })),
}));

describe("RecordParticipationResult", () => {
  it("triathlon com DNF após a bike: DNF com segmento, presença registrada, atividades intactas; preparação vai para revisão", async () => {
    const db = makeDb();
    await new RecordParticipationResult(db as never, () => NOW).execute("maria", "p1", {
      status: "DNF", abandonSegment: "Corrida (após a bike)", abandonReason: "dor no joelho",
      splits: [{ label: "Natação", seconds: 1500, kind: "SEGMENT" }, { label: "T1", seconds: 120, kind: "TRANSITION" }, { label: "Bike", seconds: 4200, kind: "SEGMENT" }],
    });
    expect(db.participationResult.create.mock.calls[0]![0].data).toMatchObject({ status: "DNF", abandonSegment: "Corrida (após a bike)", recordedByUserId: "maria" });
    expect(db.writes).toEqual(["result.create", "participation.update", "preparation.REVIEW_PENDING"]);
    expect(db.activity.deleteMany).not.toHaveBeenCalled();
    expect(db.workoutExecution.deleteMany).not.toHaveBeenCalled();
  });

  it("duas provas do mesmo torneio são duas participações com resultados independentes", async () => {
    const first = makeDb({ participation: { id: "p-100" } });
    const second = makeDb({ participation: { id: "p-200" } });
    await new RecordParticipationResult(first as never, () => NOW).execute("maria", "p-100", { status: "FINISHED", reportedTimeSeconds: 65 });
    await new RecordParticipationResult(second as never, () => NOW).execute("maria", "p-200", { status: "DNS" });
    expect(first.participationResult.create.mock.calls[0]![0].data).toMatchObject({ participationId: "p-100", status: "FINISHED", reportedTimeSeconds: 65 });
    expect(second.participationResult.create.mock.calls[0]![0].data).toMatchObject({ participationId: "p-200", status: "DNS" });
  });

  it("professor registra tempo oficial com origem e mantém a percepção do aluno; não escreve a percepção dele", async () => {
    const db = makeDb({ participation: { result: { id: "r1", athletePerception: "nadei bem", version: 1, reportedTimeSeconds: 3750, reportedByUserId: "maria" } } });
    await new RecordParticipationResult(db as never, () => NOW).execute("ricardo", "p1", { status: "FINISHED", officialTimeSeconds: 3760, officialTimeSource: "site do organizador", reportedTimeSeconds: 3750 });
    expect(db.participationResult.update.mock.calls[0]![0].data).toMatchObject({ officialTimeSeconds: 3760, reportedTimeSeconds: 3750, reportedByUserId: "maria", athletePerception: "nadei bem" });
    await expect(new RecordParticipationResult(makeDb() as never, () => NOW).execute("ricardo", "p1", { status: "FINISHED", athletePerception: "x" })).rejects.toMatchObject({ status: 403 });
  });

  it("antes do dia do evento só 'pendente' ou 'evento cancelado'", async () => {
    await expect(new RecordParticipationResult(makeDb({ startLocalDate: "2026-12-30" }) as never, () => NOW).execute("maria", "p1", { status: "FINISHED" })).rejects.toMatchObject({ code: "EVENT_NOT_HAPPENED" });
    await new RecordParticipationResult(makeDb({ startLocalDate: "2026-12-30" }) as never, () => NOW).execute("maria", "p1", { status: "EVENT_CANCELLED" });
  });
});

describe("lembrete de resultado (AC20)", () => {
  it("evento passado sem resultado pede ao aluno e ao professor; com resultado, não pede", async () => {
    const beforeDue = new Date("2026-12-20T20:00:00.000Z");
    const without = makeDb();
    await syncParticipationReminders(without as never, () => beforeDue, "p1");
    const kinds = (without.scheduledReminder.createMany.mock.calls[0]![0] as { data: Array<{ kind: string; audience: string }> }).data
      .filter((row) => row.kind === "EVENT_RESULT_MISSING").map((row) => row.audience);
    expect(kinds).toEqual(["ATHLETE", "RESPONSIBLE"]);
    const withResult = makeDb({ participation: { result: { status: "FINISHED" } } });
    await syncParticipationReminders(withResult as never, () => beforeDue, "p1");
    const rows = withResult.scheduledReminder.createMany.mock.calls[0]?.[0] as { data: Array<{ kind: string }> } | undefined;
    expect((rows?.data ?? []).some((row) => row.kind === "EVENT_RESULT_MISSING")).toBe(false);
  });
});
