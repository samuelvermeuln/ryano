/**
 * SAM-55 — follow-up tasks and idempotent notices (§7.1–7.3, AC02).
 */
import { describe, expect, it, vi } from "vitest";

import { NotificationService } from "@/modules/shared/notifications";
import { ChangeFollowUpTask, GetFollowUpTask, ListFollowUpTasks, raiseFollowUp } from "@/modules/school/application/follow-up-tasks";
import { onParticipationRegistered } from "@/modules/school/application/event-follow-up-triggers";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const clock = () => NOW;

/** Minimal in-memory tables honouring the unique keys that make the writes idempotent. */
function memoryDb({ linked = true }: { linked?: boolean } = {}) {
  const notifications: Array<Record<string, unknown>> = [];
  const tasks: Array<Record<string, unknown>> = [];
  const transitions: Array<Record<string, unknown>> = [];
  const db = {
    notifications, tasks, transitions,
    userNotification: {
      createMany: vi.fn().mockImplementation(({ data, skipDuplicates }: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const row of data) {
          const duplicate = row.dedupeKey && notifications.some((other) => other.userId === row.userId && other.dedupeKey === row.dedupeKey);
          if (duplicate && skipDuplicates) continue;
          if (duplicate) throw new Error("P2002");
          notifications.push(row);
          count += 1;
        }
        return Promise.resolve({ count });
      }),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => { notifications.push(data); return Promise.resolve(data); }),
    },
    followUpTask: {
      createMany: vi.fn().mockImplementation(({ data }: { data: Array<Record<string, unknown>> }) => {
        let count = 0;
        for (const row of data) {
          if (tasks.some((other) => other.dedupeKey === row.dedupeKey)) continue;
          tasks.push({ status: "NEW", version: 1, priority: "NORMAL", rescheduledTo: null, resolvedAt: null, ...row });
          count += 1;
        }
        return Promise.resolve({ count });
      }),
      findUniqueOrThrow: vi.fn().mockImplementation(({ where }: { where: { dedupeKey?: string; id?: string } }) =>
        Promise.resolve(withRelations(tasks.find((task) => (where.id ? task.id === where.id : task.dedupeKey === where.dedupeKey))!))),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        const task = tasks.find((row) => row.id === where.id);
        return Promise.resolve(task ? withRelations(task) : null);
      }),
      findMany: vi.fn().mockImplementation(() => Promise.resolve(tasks.map(withRelations))),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const task = tasks.find((row) => row.id === where.id)!;
        apply(task, data);
        return Promise.resolve(task);
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }: { where: { id: string; version: number }; data: Record<string, unknown> }) => {
        const task = tasks.find((row) => row.id === where.id && row.version === where.version);
        if (!task) return Promise.resolve({ count: 0 });
        apply(task, data);
        return Promise.resolve({ count: 1 });
      }),
    },
    followUpTaskTransition: { create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => { transitions.push(data); return Promise.resolve(data); }) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "ricardo" }) },
    user: { findUnique: vi.fn().mockResolvedValue({ name: "Maria" }) },
    schoolMembership: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    school: { findUnique: vi.fn() },
    schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    coachAthleteAssignment: { findFirst: vi.fn().mockImplementation(() => Promise.resolve(linked ? { id: "a" } : null)) },
    $transaction: vi.fn(),
  };
  function withRelations(task: Record<string, unknown>) {
    return { ...task, athlete: { name: "Maria" }, transitions: transitions.filter((row) => row.taskId === task.id).map((row) => ({ ...row, actor: null })) };
  }
  function apply(task: Record<string, unknown>, data: Record<string, unknown>) {
    for (const [key, value] of Object.entries(data)) {
      task[key] = value && typeof value === "object" && "increment" in value ? (task[key] as number) + (value as { increment: number }).increment : value;
    }
  }
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
  return db;
}

const preparation = { id: "prep", coachId: "coach-ricardo", schoolId: null, status: "AWAITING_ASSESSMENT" };

describe("AC02 — um aviso lógico e uma pendência", () => {
  it("reprocessar o registro do evento não duplica aviso nem pendência", async () => {
    const db = memoryDb();
    for (let round = 0; round < 2; round += 1) {
      await onParticipationRegistered(db as never, NOW, { participationId: "p1", athleteId: "maria", actorUserId: "maria", preparation });
    }
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0]).toMatchObject({ userId: "ricardo", kind: "EVENT_REGISTERED", title: "Novo evento de Maria", dedupeKey: "event-registered:p1" });
    // No goal, health or sensitive content in the notice (§7.2).
    expect(String(db.notifications[0]!.body)).not.toMatch(/objetivo|dor|lesão/i);
    expect(db.tasks).toHaveLength(1);
    expect(db.tasks[0]).toMatchObject({ assigneeUserId: "ricardo", sourceType: "EventPreparation", sourceId: "prep", status: "NEW" });
  });

  it("atleta sem vínculo não gera aviso nem pendência", async () => {
    const db = memoryDb();
    await onParticipationRegistered(db as never, NOW, { participationId: "p2", athleteId: "solo", actorUserId: "solo", preparation: { id: "prep2", coachId: null, schoolId: null, status: "UNASSIGNED" } });
    expect(db.notifications).toHaveLength(0);
    expect(db.tasks).toHaveLength(0);
  });

  it("notify com chave usa ON CONFLICT DO NOTHING (não aborta a transação)", async () => {
    const db = memoryDb();
    const service = new NotificationService(db as never, clock);
    const input = { userId: "u", kind: "EVENT_CHANGED" as const, title: "t", body: "b", dedupeKey: "k" };
    expect(await service.notify(input)).not.toBeNull();
    expect(await service.notify(input)).toBeNull();
    expect(db.userNotification.create).not.toHaveBeenCalled();
  });

  it("alteração seguinte com a pendência aberta atualiza a mesma pendência, com histórico (§7.3)", async () => {
    const db = memoryDb();
    const base = { kind: "EVENT_CHANGED" as const, sourceType: "AthleteEventParticipation", sourceId: "p1", athleteId: "maria", assigneeUserId: "ricardo", schoolId: null, title: "Revisar", href: null, dedupeKey: "participation-review:p1", actorUserId: "maria" };
    await raiseFollowUp(db as never, NOW, { ...base, reason: "alterado: optionId" });
    const second = await raiseFollowUp(db as never, NOW, { ...base, reason: "alterado: goalText" });
    expect(second.created).toBe(false);
    expect(db.tasks).toHaveLength(1);
    expect(db.transitions.map((row) => row.reason)).toEqual(["alterado: optionId", "atualizada: alterado: goalText"]);
  });
});

describe("estados (§7.2)", () => {
  async function seeded(linked = true) {
    const db = memoryDb({ linked });
    await onParticipationRegistered(db as never, NOW, { participationId: "p1", athleteId: "maria", actorUserId: "maria", preparation });
    return { db, id: String(db.tasks[0]!.id) };
  }

  it("abrir marca como visto, nunca resolvido; assumir e resolver registram o histórico", async () => {
    const { db, id } = await seeded();
    const seen = await new GetFollowUpTask(db as never, clock).execute("ricardo", id);
    expect(seen.status).toBe("SEEN");
    const started = await new ChangeFollowUpTask(db as never, clock).execute("ricardo", id, { action: "start", expectedVersion: seen.version });
    const resolved = await new ChangeFollowUpTask(db as never, clock).execute("ricardo", id, { action: "resolve", expectedVersion: started.version });
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.transitions.map((row) => row.toStatus)).toEqual(["NEW", "SEEN", "IN_PROGRESS", "RESOLVED"]);
  });

  it("reagendar exige data futura e motivo", async () => {
    const { db, id } = await seeded();
    const change = new ChangeFollowUpTask(db as never, clock);
    await expect(change.execute("ricardo", id, { action: "reschedule", expectedVersion: 1, rescheduledTo: "2026-10-10T12:00:00Z" })).rejects.toThrow();
    await expect(change.execute("ricardo", id, { action: "reschedule", expectedVersion: 1, rescheduledTo: "2026-10-01T12:00:00Z", reason: "viagem" })).rejects.toMatchObject({ status: 400 });
    const moved = await change.execute("ricardo", id, { action: "reschedule", expectedVersion: 1, rescheduledTo: "2026-10-10T12:00:00Z", reason: "viagem" });
    expect(moved).toMatchObject({ status: "RESCHEDULED", overdue: false });
  });

  it("vínculo revogado: a pendência some da lista e o link antigo dá 404", async () => {
    const { db, id } = await seeded(false);
    await expect(new GetFollowUpTask(db as never, clock).execute("ricardo", id)).rejects.toMatchObject({ status: 404 });
    expect((await new ListFollowUpTasks(db as never, clock).execute("ricardo")).tasks).toEqual([]);
  });
});
