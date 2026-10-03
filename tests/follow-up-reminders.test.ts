/**
 * SAM-56 — deadlines, reminders and the job (§7.2–7.3, §21.4–21.5, AC20).
 */
import { describe, expect, it, vi } from "vitest";

import {
  addBusinessDays,
  DEFAULT_FOLLOW_UP_POLICY,
  deferForQuietHours,
  eventReminderPlan,
  firstAnalysisDeadline,
  resultMissingAt,
} from "@/modules/school/domain/follow-up-schedule";
import { RunFollowUpReminders, syncParticipationReminders } from "@/modules/school/application/follow-up-reminders";

const NOW = new Date("2026-10-03T12:00:00.000Z"); // Saturday, 09:00 in São Paulo
const SP = "America/Sao_Paulo";
const event = (startLocalDate: string, overrides: Record<string, unknown> = {}) => ({
  id: "evt", name: "Meia de Floripa", startLocalDate, endLocalDate: null, dateConfirmed: true, timeZone: SP, status: "PLANNED", ...overrides,
});

describe("calendário de prazos", () => {
  it("dias úteis pulam o fim de semana do calendário configurado", () => {
    expect(addBusinessDays("2026-10-02", 2, [1, 2, 3, 4, 5])).toBe("2026-10-06"); // sex + 2 úteis = ter
    expect(addBusinessDays("2026-10-02", 2, [1, 2, 3, 4, 5, 6])).toBe("2026-10-05"); // sábado conta
    expect(addBusinessDays("2026-10-02", 0, [1, 2, 3, 4, 5])).toBe("2026-10-02");
    expect(() => addBusinessDays("2026-10-02", 1, [])).toThrow();
  });

  it("primeira análise: fim do N-ésimo dia útil no fuso da organização", () => {
    const { dueLocalDate, dueAt } = firstAnalysisDeadline(NOW, DEFAULT_FOLLOW_UP_POLICY);
    expect(dueLocalDate).toBe("2026-10-06");
    expect(dueAt.toISOString()).toBe("2026-10-07T03:00:00.000Z");
  });

  it("D−N às 09:00 no fuso do evento; só futuros; nada sem data confirmada ou cancelado (AC20)", () => {
    const plan = eventReminderPlan(event("2026-10-11"), [30, 14, 7, 1], NOW);
    expect(plan.map((item) => item.daysBefore)).toEqual([7, 1]);
    expect(plan[0]!.dueAt.toISOString()).toBe("2026-10-04T12:00:00.000Z");
    expect(eventReminderPlan(event("2026-09-20"), [30, 14, 7, 1], NOW)).toEqual([]);
    expect(eventReminderPlan(event("2026-12-20", { dateConfirmed: false }), [7], NOW)).toEqual([]);
    expect(eventReminderPlan(event("2026-12-20", { status: "CANCELLED" }), [7], NOW)).toEqual([]);
    expect(eventReminderPlan(event("2026-12-20", { timeZone: "Europe/Lisbon" }), [7], NOW)[0]!.dueAt.toISOString()).toBe("2026-12-13T09:00:00.000Z");
    expect(resultMissingAt(event("2026-09-20"), NOW)).toBeNull();
    expect(resultMissingAt(event("2026-10-11"), NOW)?.toISOString()).toBe("2026-10-12T12:00:00.000Z");
  });

  it("horário silencioso adia só o externo; janela que cruza a meia-noite", () => {
    const at2330 = new Date("2026-10-04T02:30:00.000Z"); // 23:30 em SP
    expect(deferForQuietHours(at2330, "22:00", "07:00", SP).toISOString()).toBe("2026-10-04T10:00:00.000Z");
    const at0600 = new Date("2026-10-04T09:00:00.000Z"); // 06:00
    expect(deferForQuietHours(at0600, "22:00", "07:00", SP).toISOString()).toBe("2026-10-04T10:00:00.000Z");
    expect(deferForQuietHours(NOW, "22:00", "07:00", SP)).toBe(NOW);
    expect(deferForQuietHours(NOW, null, null, SP)).toBe(NOW);
  });
});

/** Memory tables with the unique dedupe keys of the real ones. */
function memoryDb(startLocalDate: string) {
  const reminders: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const state = { event: event(startLocalDate), participationStatus: "PLANNED" };
  const db = {
    reminders, notifications, state,
    athleteEventParticipation: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve({
        id: "p1", athleteId: "maria", status: state.participationStatus, event: state.event,
        preparation: { id: "prep", status: "PLANNING", coachId: "coach", schoolId: null, createdAt: NOW },
      })),
    },
    followUpPolicy: { findUnique: vi.fn().mockResolvedValue(null) },
    preparationMilestone: { findMany: vi.fn().mockResolvedValue([]) },
    scheduledReminder: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { status: string; dueAt?: { lte: Date }; sourceId?: { in: string[] } } }) =>
        Promise.resolve(reminders.filter((row) => row.status === where.status && (!where.dueAt || (row.dueAt as Date) <= where.dueAt.lte)))),
      createMany: vi.fn().mockImplementation(({ data }: { data: Array<Record<string, unknown>> }) => {
        let count = 0;
        for (const row of data) {
          if (reminders.some((other) => other.dedupeKey === row.dedupeKey)) continue;
          reminders.push({ status: "PENDING", attempts: 0, ...row });
          count += 1;
        }
        return Promise.resolve({ count });
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }: { where: { id: string | { in: string[] }; status: string }; data: Record<string, unknown> }) => {
        const ids = typeof where.id === "string" ? [where.id] : where.id.in;
        const rows = reminders.filter((row) => ids.includes(row.id as string) && row.status === where.status);
        for (const row of rows) Object.assign(row, { ...data, attempts: (row.attempts as number) + 1 });
        return Promise.resolve({ count: rows.length });
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Promise.resolve(Object.assign(reminders.find((row) => row.id === where.id)!, data))),
    },
    userNotification: {
      createMany: vi.fn().mockImplementation(({ data }: { data: Array<Record<string, unknown>> }) => {
        let count = 0;
        for (const row of data) {
          if (notifications.some((other) => other.userId === row.userId && other.dedupeKey === row.dedupeKey)) continue;
          notifications.push(row);
          count += 1;
        }
        return Promise.resolve({ count });
      }),
    },
    notificationPreference: { findUnique: vi.fn().mockResolvedValue({ timezone: SP, quietHoursStart: "08:00", quietHoursEnd: "10:00", dailySummary: false }) },
    user: { findUnique: vi.fn().mockResolvedValue({ name: "Maria" }) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "ricardo" }) },
    coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue({ id: "a" }) },
    schoolMembership: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    schoolMembershipRole: { findMany: vi.fn() },
    schoolAthleteMembership: { findFirst: vi.fn() },
    school: { findUnique: vi.fn() },
    eventPreparation: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  // Like the database: a failed transaction leaves no trace (the claim is undone).
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const snapshot = reminders.map((row) => ({ ...row }));
    const notificationCount = notifications.length;
    try {
      return await fn(db);
    } catch (error) {
      reminders.splice(0, reminders.length, ...snapshot);
      notifications.splice(notificationCount);
      throw error;
    }
  });
  return db;
}

describe("sincronização e job", () => {
  it("mudar a data cancela os D−N antigos e cria os novos", async () => {
    const db = memoryDb("2026-10-11");
    await syncParticipationReminders(db as never, () => NOW, "p1");
    expect(db.reminders.filter((row) => row.status === "PENDING").map((row) => row.dedupeKey)).toEqual(expect.arrayContaining([
      "event-approaching:p1:2026-10-11:D7:ATHLETE", "event-approaching:p1:2026-10-11:D1:RESPONSIBLE", "result-missing:p1:2026-10-11",
    ]));
    db.state.event = event("2026-10-25");
    const { cancelled } = await syncParticipationReminders(db as never, () => NOW, "p1");
    // D−N for athlete and coach + "resultado não registrado" for both (SAM-66).
    expect(cancelled).toBe(6);
    expect(db.reminders.filter((row) => row.status === "PENDING").every((row) => String(row.dedupeKey).includes("2026-10-25"))).toBe(true);
  });

  it("participação cancelada cancela todos", async () => {
    const db = memoryDb("2026-10-11");
    await syncParticipationReminders(db as never, () => NOW, "p1");
    db.state.participationStatus = "CANCELLED";
    await syncParticipationReminders(db as never, () => NOW, "p1");
    expect(db.reminders.every((row) => row.status === "CANCELLED")).toBe(true);
  });

  it("job duas vezes não duplica; aviso interno gravado já, externo adiado pelo silêncio", async () => {
    const db = memoryDb("2026-10-11");
    await syncParticipationReminders(db as never, () => NOW, "p1");
    const d7 = new Date("2026-10-04T12:05:00.000Z"); // 09:05 local, inside the 08–10 quiet window
    const first = await new RunFollowUpReminders(db as never, () => d7).execute();
    const second = await new RunFollowUpReminders(db as never, () => d7).execute();
    expect(first.sent).toBe(2);
    expect(second).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(db.notifications.map((row) => [row.userId, row.title])).toEqual([
      ["maria", "Faltam 7 dias para Meia de Floripa"],
      ["ricardo", "Maria: faltam 7 dias para o evento"],
    ]);
    expect((db.notifications[0]!.payload as { externalNotBefore: string }).externalNotBefore).toBe("2026-10-04T13:00:00.000Z");
  });

  it("falha de um lembrete não para os outros", async () => {
    const db = memoryDb("2026-10-11");
    await syncParticipationReminders(db as never, () => NOW, "p1");
    db.coachProfile.findUnique.mockRejectedValueOnce(new Error("timeout"));
    const result = await new RunFollowUpReminders(db as never, () => new Date("2026-10-04T12:05:00.000Z")).execute();
    expect(result).toMatchObject({ sent: 1, failed: 1 });
    expect(db.reminders.find((row) => String(row.dedupeKey).endsWith("D7:RESPONSIBLE"))).toMatchObject({ status: "PENDING", lastError: "Error: timeout" });
  });
});
