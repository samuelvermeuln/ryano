/**
 * SAM-61 — execution and feedback (§6.1, §13.8, §18.3, §19.1; AC12, AC24).
 */
import { describe, expect, it, vi } from "vitest";

import { deriveExecutionState } from "@/modules/school/domain/execution-state";
import { SubmitSessionFeedback, sessionFeedbackSchema } from "@/modules/school/application/session-feedback";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

describe("estado de execução derivado (AC12)", () => {
  const base = { hasMatchedExecution: false, completion: null, now: NOW };
  it("passada dentro da janela = aguardando registro; depois = sem registro; nunca 'falta' indistinta", () => {
    expect(deriveExecutionState({ ...base, status: "SCHEDULED", scheduledAt: hoursAgo(5) })).toBe("AWAITING_RECORD");
    expect(deriveExecutionState({ ...base, status: "SCHEDULED", scheduledAt: hoursAgo(72) })).toBe("NO_RECORD");
    expect(deriveExecutionState({ ...base, status: "SCHEDULED", scheduledAt: hoursAgo(72), syncWindowHours: 96 })).toBe("AWAITING_RECORD");
    expect(deriveExecutionState({ ...base, status: "SCHEDULED", scheduledAt: new Date(NOW.getTime() + 3_600_000) })).toBe("FUTURE");
    expect(deriveExecutionState({ ...base, status: "CANCELLED", scheduledAt: hoursAgo(72) })).toBe("CANCELLED");
    expect(deriveExecutionState({ ...base, status: "JUSTIFIED", scheduledAt: hoursAgo(72) })).toBe("JUSTIFIED");
    expect(deriveExecutionState({ ...base, status: "SCHEDULED", scheduledAt: hoursAgo(3), completion: "NOT_DONE" })).toBe("CONFIRMED_NOT_DONE");
    expect(deriveExecutionState({ ...base, status: "SCHEDULED", scheduledAt: hoursAgo(3), hasMatchedExecution: true })).toBe("LINKED");
    expect(deriveExecutionState({ ...base, status: "PARTIALLY_COMPLETED", scheduledAt: hoursAgo(3) })).toBe("PARTIAL");
  });
});

describe("validação do relato", () => {
  it("dor exige descrição; não realizado não tem registro manual; registro manual pede duração ou distância", () => {
    expect(() => sessionFeedbackSchema.parse({ assignmentId: "a", painReported: true })).toThrow(/Descreva/);
    expect(() => sessionFeedbackSchema.parse({ assignmentId: "a", completion: "NOT_DONE", manual: { durationMinutes: 30 } })).toThrow(/não realizada/);
    expect(() => sessionFeedbackSchema.parse({ assignmentId: "a", completion: "PARTIAL", manual: {} })).toThrow(/duração ou distância/);
    expect(() => sessionFeedbackSchema.parse({ completion: "FULL" })).toThrow(/prescrita OU a atividade/);
  });
});

function makeDb({ matched = false }: { matched?: boolean } = {}) {
  const feedbacks: Array<Record<string, unknown>> = [];
  const executions: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const tx = {
    feedbacks, executions, notifications,
    workoutExecution: { create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => { executions.push(data); return Promise.resolve(data); }) },
    athleteFeedback: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { workoutExecutionId?: string; activityId?: string } }) => Promise.resolve(feedbacks.find((row) => (where.workoutExecutionId ? row.workoutExecutionId === where.workoutExecutionId : row.activityId === where.activityId)) ?? null)),
      findFirst: vi.fn().mockImplementation(({ where }: { where: { workoutAssignmentId: string } }) => Promise.resolve(feedbacks.find((row) => row.workoutAssignmentId === where.workoutAssignmentId && !row.workoutExecutionId) ?? null)),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => { feedbacks.push(data); return Promise.resolve(data); }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Promise.resolve(Object.assign(feedbacks.find((row) => row.id === where.id)!, data))),
      upsert: vi.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) => { feedbacks.push(create); return Promise.resolve(create); }),
    },
    workoutAssignment: {
      findUnique: vi.fn().mockResolvedValue({
        id: "a1", athleteId: "maria", status: "SCHEDULED", coachId: "coach-r", schoolId: null, scheduledAt: hoursAgo(4),
        workout: { sportType: "open-water" }, athlete: { name: "Maria" },
        executions: matched ? [{ id: "exec-garmin" }] : [],
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    workoutAssignmentEventLink: { findMany: vi.fn().mockResolvedValue([]) },
    workoutAssignmentHistory: { create: vi.fn().mockResolvedValue({}) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "ricardo" }) },
    coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue({ id: "link" }) },
    userNotification: {
      createMany: vi.fn().mockImplementation(({ data }: { data: Array<Record<string, unknown>> }) => {
        const fresh = data.filter((row) => !notifications.some((other) => other.userId === row.userId && other.dedupeKey === row.dedupeKey));
        notifications.push(...fresh);
        return Promise.resolve({ count: fresh.length });
      }),
    },
    followUpTask: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    followUpTaskTransition: { create: vi.fn().mockResolvedValue({}) },
    activity: { findUnique: vi.fn().mockResolvedValue({ id: "act-1", userId: "maria" }) },
    $transaction: vi.fn(),
  };
  tx.$transaction.mockImplementation((fn: (client: unknown) => unknown) => fn(tx));
  return tx;
}

describe("SubmitSessionFeedback", () => {
  it("sem relógio: parcial interrompida por condições do mar vira execução manual; dor avisa o responsável uma vez", async () => {
    const db = makeDb();
    const input = {
      assignmentId: "a1", completion: "PARTIAL", adaptationReason: "SAFETY_CONDITIONS", adaptationNote: "mar agitado",
      painReported: true, painNote: "dor no ombro direito", manual: { durationMinutes: 25, distanceMeters: 1200 },
    };
    await new SubmitSessionFeedback(db as never, () => NOW).execute("maria", input);
    expect(db.executions[0]).toMatchObject({ source: "manual", workoutAssignmentId: "a1", durationSeconds: 1500, distanceMeters: 1200, matchStatus: "CONFIRMED" });
    expect((db.executions[0]!.activityPayload as Record<string, unknown>).authorUserId).toBe("maria");
    expect(db.feedbacks[0]).toMatchObject({ completion: "PARTIAL", adaptationReason: "SAFETY_CONDITIONS", painReported: true, workoutExecutionId: db.executions[0]!.id });
    expect(db.workoutAssignment.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { status: "PARTIALLY_COMPLETED" } });
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0]).toMatchObject({ userId: "ricardo", kind: "FEEDBACK_PAIN_REPORTED" });
    expect(String(db.notifications[0]!.body)).toContain("não é canal de emergência");
    // Re-sending the same report does not warn again (dedupe by report).
    await new SubmitSessionFeedback(db as never, () => NOW).execute("maria", { ...input, manual: undefined });
    expect(db.notifications).toHaveLength(1);
  });

  it("'não realizei' com motivo vira justificada, sem execução; relato não muda a prescrição", async () => {
    const db = makeDb();
    await new SubmitSessionFeedback(db as never, () => NOW).execute("maria", { assignmentId: "a1", completion: "NOT_DONE", adaptationReason: "SAFETY_CONDITIONS" });
    expect(db.executions).toHaveLength(0);
    expect(db.feedbacks[0]).toMatchObject({ workoutAssignmentId: "a1", workoutExecutionId: null, completion: "NOT_DONE" });
    expect(db.workoutAssignment.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { status: "JUSTIFIED" } });
    expect(db.workoutAssignment.update.mock.calls.every((call) => !("workoutId" in (call[0] as { data: Record<string, unknown> }).data))).toBe(true);
  });

  it("com execução sincronizada o relato vai para ela; outro atleta recebe 404", async () => {
    const db = makeDb({ matched: true });
    await new SubmitSessionFeedback(db as never, () => NOW).execute("maria", { assignmentId: "a1", completion: "FULL", rpe: 7 });
    expect(db.feedbacks[0]).toMatchObject({ workoutExecutionId: "exec-garmin", rpe: 7, rpeScale: "CR10" });
    await expect(new SubmitSessionFeedback(db as never, () => NOW).execute("joao", { assignmentId: "a1", completion: "FULL" })).rejects.toMatchObject({ status: 404 });
  });

  it("atividade não planejada recebe RPE pelo activityId", async () => {
    const db = makeDb();
    await new SubmitSessionFeedback(db as never, () => NOW).execute("maria", { activityId: "act-1", rpe: 5, comment: "rodagem leve" });
    expect(db.athleteFeedback.upsert.mock.calls[0][0]).toMatchObject({ where: { activityId: "act-1" }, create: { activityId: "act-1", rpe: 5 } });
  });
});
