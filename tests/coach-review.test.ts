/**
 * SAM-64 — the coach's review (§6 step 12, §19.2, §21.1 Review, AC24).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/modules/school/application/can-read-athlete-current-data", () => ({
  CanReadAthleteCurrentData: class { execute() { return Promise.resolve(access.allowed); } },
}));
beforeEach(() => { access.allowed = true; });

import { SaveCoachReview } from "@/modules/school/application/coach-reviews";
import { GetFollowUpTask } from "@/modules/school/application/follow-up-tasks";
import { reviewState } from "@/modules/school/domain/coach-review";

const NOW = new Date("2026-10-03T12:00:00.000Z");

function makeDb(options: { executions?: Array<{ id: string }>; report?: boolean; existing?: Record<string, unknown> | null; coachId?: string } = {}) {
  const writes: string[] = [];
  const record = (model: string, op: string) => (impl: (...args: never[]) => unknown) => vi.fn((...args: never[]) => { writes.push(`${model}.${op}`); return impl(...args); });
  const tx = {
    writes,
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: options.coachId ?? "coach-r" }) },
    workoutAssignment: {
      findUnique: vi.fn().mockResolvedValue({ id: "a1", athleteId: "maria", coachId: "coach-r", schoolId: null, status: "AVAILABLE", executions: options.executions ?? [{ id: "e1" }] }),
      count: vi.fn().mockResolvedValue(1),
      update: record("workoutAssignment", "update")(() => Promise.resolve({})),
      create: record("workoutAssignment", "create")(() => Promise.resolve({})),
    },
    workout: { create: record("workout", "create")(() => Promise.resolve({})), update: record("workout", "update")(() => Promise.resolve({})) },
    athleteFeedback: { findFirst: vi.fn().mockResolvedValue(options.report ? { id: "f1" } : null) },
    coachReview: {
      findFirst: vi.fn().mockResolvedValue(options.existing ?? null),
      create: record("coachReview", "create")(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...data, version: 1 })),
      update: record("coachReview", "update")(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...options.existing, ...data, version: 2 })),
    },
    coachReviewRevision: { create: record("coachReviewRevision", "create")(() => Promise.resolve({})) },
    workoutAssignmentComment: { updateMany: record("workoutAssignmentComment", "updateMany")(() => Promise.resolve({ count: 1 })) },
    followUpTask: { findMany: vi.fn().mockResolvedValue([{ id: "t1", status: "NEW" }]), update: record("followUpTask", "update")(() => Promise.resolve({})) },
    followUpTaskTransition: { create: vi.fn().mockResolvedValue({}) },
    userNotification: { createMany: record("userNotification", "createMany")(() => Promise.resolve({ count: 1 })) },
    followUpPolicy: { findUnique: vi.fn().mockResolvedValue(null) },
    scheduledReminder: {
      updateMany: record("scheduledReminder", "updateMany")(() => Promise.resolve({ count: 0 })),
      createMany: record("scheduledReminder", "createMany")(() => Promise.resolve({ count: 1 })),
    },
    $transaction: vi.fn(),
  };
  tx.$transaction.mockImplementation((fn: (client: unknown) => unknown) => fn(tx));
  return tx;
}

const input = { target: { type: "assignment", assignmentId: "a1" }, observation: "Boa leitura do mar; reduzir a primeira parte.", decision: "KEEP" };

describe("SaveCoachReview", () => {
  it("decisão ADAPT_FUTURE não cria nem altera prescrição: só a revisão, os vínculos e os avisos", async () => {
    const db = makeDb();
    await new SaveCoachReview(db as never, () => NOW).execute("ricardo", {
      ...input, decision: "ADAPT_FUTURE", justification: "Sinais de fadiga", linkedAssignmentIds: ["a9"],
    });
    expect(db.writes.filter((write) => write.startsWith("workout"))).toEqual(["workoutAssignmentComment.updateMany"]);
    expect(db.coachReview.create.mock.calls[0]![0].data).toMatchObject({ decision: "ADAPT_FUTURE", linkedAssignmentIds: ["a9"], targetType: "ASSIGNMENT", authorUserId: "ricardo" });
    expect(db.followUpTask.update).toHaveBeenCalled();
    expect(db.userNotification.createMany.mock.calls[0]![0].data[0]).toMatchObject({ userId: "maria", kind: "WORKOUT_REVIEWED", href: "/app/treinos/a1" });
  });

  it("próxima revisão cria lembrete REVIEW_DUE para o professor", async () => {
    const db = makeDb();
    await new SaveCoachReview(db as never, () => NOW).execute("ricardo", { ...input, nextReviewLocalDate: "2026-10-10" });
    expect(db.scheduledReminder.createMany.mock.calls[0]![0].data[0]).toMatchObject({
      kind: "REVIEW_DUE", sourceType: "CoachReview", audience: "RESPONSIBLE", payload: { dueLocalDate: "2026-10-10" }, dueAt: new Date("2026-10-10T12:00:00.000Z"),
    });
  });

  it("editar guarda a versão anterior com a autoria; decisão que muda o plano exige justificativa", async () => {
    const existing = { id: "r1", version: 1, observation: "antes", decision: "KEEP", justification: null, nextReviewLocalDate: null, linkedAssignmentIds: [], isVisible: true, authorUserId: "ricardo", updatedAt: NOW };
    const db = makeDb({ existing });
    await new SaveCoachReview(db as never, () => NOW).execute("ricardo", { ...input, observation: "depois" });
    expect(db.coachReviewRevision.create.mock.calls[0]![0].data).toMatchObject({ reviewId: "r1", version: 1, snapshot: expect.objectContaining({ observation: "antes", authorUserId: "ricardo" }) });
    await expect(new SaveCoachReview(makeDb() as never, () => NOW).execute("ricardo", { ...input, decision: "RENEGOTIATE_GOAL" })).rejects.toThrow(/Justifique/);
  });

  it("só revisa com execução vinculada ou relato; professor de outra prescrição ou sem vínculo atual não revisa", async () => {
    await expect(new SaveCoachReview(makeDb({ executions: [] }) as never, () => NOW).execute("ricardo", input)).rejects.toMatchObject({ code: "REVIEW_NOT_YET" });
    await new SaveCoachReview(makeDb({ executions: [], report: true }) as never, () => NOW).execute("ricardo", input);
    await expect(new SaveCoachReview(makeDb({ coachId: "coach-other" }) as never, () => NOW).execute("carlos", input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    access.allowed = false;
    await expect(new SaveCoachReview(makeDb() as never, () => NOW).execute("ricardo", input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("abrir o aviso não é revisão (§22.7)", () => {
  it("abrir a pendência só a marca vista; nenhuma revisão é escrita e a sessão segue aguardando revisão", async () => {
    const task = { id: "t1", status: "NEW", version: 1, kind: "FEEDBACK_PAIN_REPORTED", sourceType: "WorkoutAssignment", sourceId: "a1", athleteId: "maria", assigneeUserId: "ana", schoolId: null, title: "Revisar", href: null, priority: "HIGH", dueAt: null, rescheduledTo: null, createdAt: NOW, resolvedAt: null, athlete: { name: "Maria" }, transitions: [] };
    const touched = new Set<string>();
    const models = {
      followUpTask: {
        findUnique: vi.fn().mockResolvedValue(task),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ ...task, status: "SEEN", version: 2 }),
      },
      followUpTaskTransition: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(),
    };
    const db: Record<string, unknown> = new Proxy(models, { get(target, key: string) { touched.add(key); return (target as Record<string, unknown>)[key]; } });
    models.$transaction.mockImplementation((fn: (client: unknown) => unknown) => fn(db));
    const view = await new GetFollowUpTask(db as never, () => NOW).execute("ana", "t1");
    expect(view.status).toBe("SEEN");
    expect(touched.has("coachReview")).toBe(false);
    expect(reviewState({ reviewable: true, reviewed: false })).toBe("AWAITING_REVIEW");
  });
});
