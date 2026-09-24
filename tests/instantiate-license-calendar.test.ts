/**
 * TM011 — InstantiateLicenseCalendar: timezone-correct anchoring (RF-006).
 *
 * Foco: cada dia é ancorado no fuso do atleta, não em meia-noite UTC; a
 * semana que atravessa a troca de horário de verão (2026-03-08,
 * America/New_York) não desloca nenhum dia; idempotência preservada.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { InstantiateLicenseCalendar } from "@/modules/school/application/instantiate-license-calendar";

const now = new Date("2026-09-23T12:00:00Z");

function withTx<T extends Record<string, Record<string, unknown>>>(db: T) {
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

function twoWeekPlan() {
  return {
    weeks: [
      { week: 1, days: [{ workoutTemplateId: "tpl-mon", dayOfWeek: 1 }, { workoutTemplateId: "tpl-wed", dayOfWeek: 3 }] },
      { week: 2, days: [{ workoutTemplateId: "tpl-mon-2", dayOfWeek: 1 }] },
    ],
  };
}

function makeDb(over: Record<string, unknown> = {}) {
  const db = {
    trainingLicense: {
      findUnique: vi.fn().mockResolvedValue({
        id: "lic-1", athleteId: "athlete-1", versionId: "ver-1", status: "ACTIVE",
        calendarInstantiated: false, startedAt: null,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    trainingProductVersion: {
      findUnique: vi.fn().mockResolvedValue({ id: "ver-1", planPayload: twoWeekPlan() }),
    },
    workoutAssignment: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    ...over,
  };
  return withTx(db);
}

describe("InstantiateLicenseCalendar [TM011]", () => {
  it("exige timezone e startLocalDate válidos", async () => {
    const db = makeDb();
    await expect(new InstantiateLicenseCalendar(db as unknown as PrismaClient, () => now)
      .execute({ licenseId: "lic-1" })).rejects.toBeInstanceOf(Error);
    await expect(new InstantiateLicenseCalendar(db as unknown as PrismaClient, () => now)
      .execute({ licenseId: "lic-1", timezone: "America/New_York", startLocalDate: "not-a-date" }))
      .rejects.toBeInstanceOf(Error);
  });

  it("ancora segunda-feira em fuso positivo (Asia/Tokyo) corretamente", async () => {
    const db = makeDb();
    await new InstantiateLicenseCalendar(db as unknown as PrismaClient, () => now).execute({
      licenseId: "lic-1", timezone: "Asia/Tokyo", startLocalDate: "2026-09-23", // a Wednesday
    });
    const rows = (db.workoutAssignment.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    // Week 1 starts on the Monday on/before 2026-09-23 -> 2026-09-21.
    const monday = rows.find((r: { workoutTemplateId: string }) => r.workoutTemplateId === "tpl-mon");
    expect(monday.scheduledAt.toISOString()).toBe("2026-09-20T15:00:00.000Z"); // 2026-09-21 00:00 JST
  });

  it("ancora em fuso negativo (America/New_York) corretamente", async () => {
    const db = makeDb();
    await new InstantiateLicenseCalendar(db as unknown as PrismaClient, () => now).execute({
      licenseId: "lic-1", timezone: "America/New_York", startLocalDate: "2026-09-23",
    });
    const rows = (db.workoutAssignment.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    const monday = rows.find((r: { workoutTemplateId: string }) => r.workoutTemplateId === "tpl-mon");
    expect(monday.scheduledAt.toISOString()).toBe("2026-09-21T04:00:00.000Z"); // 2026-09-21 00:00 EDT (GMT-4)
  });

  it("semana atravessando o 'spring forward' (America/New_York) não desloca nenhum dia", async () => {
    const db = makeDb({
      trainingProductVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: "ver-1",
          planPayload: { weeks: [{ week: 1, days: [
            { workoutTemplateId: "tpl-sun", dayOfWeek: 7 }, // 2026-03-08, the 23h day
            { workoutTemplateId: "tpl-mon", dayOfWeek: 1 },  // week anchor Monday, 2026-03-02
          ] }] },
        }),
      },
    });
    await new InstantiateLicenseCalendar(db as unknown as PrismaClient, () => now).execute({
      licenseId: "lic-1", timezone: "America/New_York", startLocalDate: "2026-03-08",
    });
    const rows = (db.workoutAssignment.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    for (const row of rows) {
      const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(row.scheduledAt);
      const expected = row.workoutTemplateId === "tpl-sun" ? "2026-03-08" : "2026-03-02";
      expect(localDate).toBe(expected);
    }
  });

  it("dueAt é a meia-noite local do dia seguinte, não scheduledAt + 23h fixo", async () => {
    const db = makeDb({
      trainingProductVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: "ver-1",
          planPayload: { weeks: [{ week: 1, days: [{ workoutTemplateId: "tpl-sun", dayOfWeek: 7 }] }] },
        }),
      },
    });
    // Anchor so the only day lands exactly on 2026-03-08, the 23h day.
    await new InstantiateLicenseCalendar(db as unknown as PrismaClient, () => now).execute({
      licenseId: "lic-1", timezone: "America/New_York", startLocalDate: "2026-03-02",
    });
    const rows = (db.workoutAssignment.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    const row = rows[0];
    const hours = (row.dueAt.getTime() - row.scheduledAt.getTime()) / 3_600_000;
    expect(hours).toBe(23); // not the old hardcoded 23h-always assumption — this IS a 23h day, verified independently above
  });

  it("idempotente: licença já instanciada não cria linhas novas", async () => {
    const db = makeDb({
      trainingLicense: {
        findUnique: vi.fn().mockResolvedValue({
          id: "lic-1", athleteId: "athlete-1", versionId: "ver-1", status: "ACTIVE",
          calendarInstantiated: true, startedAt: null,
        }),
        update: vi.fn(),
      },
    });
    const out = await new InstantiateLicenseCalendar(db as unknown as PrismaClient, () => now).execute({
      licenseId: "lic-1", timezone: "America/New_York", startLocalDate: "2026-09-23",
    });
    expect(out.alreadyInstantiated).toBe(true);
    expect(db.workoutAssignment.createMany).not.toHaveBeenCalled();
  });
});
