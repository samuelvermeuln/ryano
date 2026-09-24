/**
 * TM041 — ActivateTrainingLicense: START_NOW/START_ON_DATE/TARGET_EVENT_DATE
 * mode handling, conflict preview, ownership, and idempotent confirmation
 * (RF-109). Wraps InstantiateLicenseCalendar (TM011) — reuses its
 * timezone/calendar math, never reimplements it.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ActivateTrainingLicense } from "@/modules/school/application/activate-training-license";

const now = new Date("2026-09-23T12:00:00Z"); // a Wednesday

function baseLicense(over: Record<string, unknown> = {}) {
  return {
    id: "lic-1", athleteId: "athlete-1", versionId: "ver-1", status: "ACTIVE",
    activationMode: null, activationStatus: "PENDING", timezone: null,
    chosenStartLocalDate: null, anchorEventLocalDate: null, updatedAt: new Date("2026-09-20T00:00:00Z"),
    ...over,
  };
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
  let license = baseLicense();
  const db = {
    trainingLicense: {
      findUnique: vi.fn().mockImplementation(async () => license),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        license = { ...license, ...data };
        return license;
      }),
    },
    trainingProductVersion: {
      findUnique: vi.fn().mockResolvedValue({ id: "ver-1", planPayload: twoWeekPlan() }),
    },
    workoutAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    ...over,
  };
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    __setLicense: (l: Record<string, unknown>) => { license = { ...license, ...l }; },
    __getLicense: () => license,
  });
}

describe("ActivateTrainingLicense [TM041]", () => {
  it("START_NOW usa a data local de hoje no fuso do atleta", async () => {
    const db = makeDb();
    const out = await new ActivateTrainingLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", mode: "START_NOW", timezone: "America/Sao_Paulo" });
    expect(out.preview).toBe(false);
    expect(out.startLocalDate).toBe("2026-09-23");
    expect(db.workoutAssignment.createMany).toHaveBeenCalledTimes(1);
  });

  it("START_ON_DATE exige startLocalDate", async () => {
    const db = makeDb();
    await expect(new ActivateTrainingLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", mode: "START_ON_DATE", timezone: "America/Sao_Paulo" }))
      .rejects.toBeInstanceOf(Error);
  });

  it("TARGET_EVENT_DATE ancora para que a última sessão caia exatamente no dia da prova (mesmo dia da semana)", async () => {
    // Plan's last day: week 2 / dayOfWeek 1 (Monday) -> offset 7. Event date
    // must also be a Monday for exact alignment (documented limitation).
    const db = makeDb();
    const out = await new ActivateTrainingLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", mode: "TARGET_EVENT_DATE", timezone: "America/Sao_Paulo", targetEventDate: "2026-11-02" }); // a Monday
    const rows = (db.workoutAssignment.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0].data as Array<{ workoutTemplateId: string; scheduledAt: Date }>;
    const lastRow = rows.find((r) => r.workoutTemplateId === "tpl-mon-2")!;
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(lastRow.scheduledAt);
    expect(localDate).toBe("2026-11-02");
    expect(out.preview).toBe(false);
  });

  it("preview retorna calendário e conflitos sem escrever nada", async () => {
    const db = makeDb({
      workoutAssignment: {
        findMany: vi.fn().mockResolvedValue([
          { id: "existing-1", scheduledAt: new Date("2026-09-20T03:00:00.000Z") }, // 2026-09-20 00:00 -03:00 = Sunday in São Paulo... adjust below
        ]),
        createMany: vi.fn(),
      },
    });
    const out = await new ActivateTrainingLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", mode: "START_NOW", timezone: "America/Sao_Paulo", preview: true });
    expect(out.preview).toBe(true);
    expect(db.trainingLicense.update).not.toHaveBeenCalled();
    expect(db.workoutAssignment.createMany).not.toHaveBeenCalled();
    expect("weeks" in out && out.weeks.length).toBe(2);
  });

  it("preview detecta conflito com treino existente no mesmo dia local", async () => {
    // START_NOW anchors week 1 to Monday on/before 2026-09-23 (Wed) -> 2026-09-21.
    // tpl-mon lands on 2026-09-21 local -> midnight America/Sao_Paulo = 2026-09-21T03:00:00.000Z.
    const db = makeDb({
      workoutAssignment: {
        findMany: vi.fn().mockResolvedValue([
          { id: "existing-1", scheduledAt: new Date("2026-09-21T15:00:00.000Z") }, // still 2026-09-21 local (noon-ish)
        ]),
        createMany: vi.fn(),
      },
    });
    const out = await new ActivateTrainingLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", mode: "START_NOW", timezone: "America/Sao_Paulo", preview: true });
    expect("conflicts" in out && out.conflicts).toEqual([{ localDate: "2026-09-21", existingAssignmentId: "existing-1" }]);
  });

  it("ativar duas vezes com a MESMA escolha não duplica sessões (idempotente)", async () => {
    const db = makeDb();
    const usecase = new ActivateTrainingLicense(db as unknown as PrismaClient, () => now);
    const input = { licenseId: "lic-1", mode: "START_NOW" as const, timezone: "America/Sao_Paulo" };
    await usecase.execute("athlete-1", input);
    const second = await usecase.execute("athlete-1", input);
    expect(second.preview).toBe(false);
    expect("alreadyInstantiated" in second && second.alreadyInstantiated).toBe(true);
    // First call: 1 update for the activation fields + 1 for calendarInstantiated
    // (InstantiateLicenseCalendar's own write). Second call: both are skipped
    // (activation already matches; calendar already instantiated) — 0 more.
    expect(db.trainingLicense.update).toHaveBeenCalledTimes(2);
    expect(db.workoutAssignment.createMany).toHaveBeenCalledTimes(1);
  });

  it("ativar com escolha DIFERENTE depois de já ativado responde LICENSE_ALREADY_ACTIVE", async () => {
    const db = makeDb();
    const usecase = new ActivateTrainingLicense(db as unknown as PrismaClient, () => now);
    await usecase.execute("athlete-1", { licenseId: "lic-1", mode: "START_NOW", timezone: "America/Sao_Paulo" });
    await expect(usecase.execute("athlete-1", { licenseId: "lic-1", mode: "START_ON_DATE", timezone: "America/Sao_Paulo", startLocalDate: "2026-10-01" }))
      .rejects.toMatchObject({ code: "LICENSE_ALREADY_ACTIVE" });
  });

  it("expectedVersion desatualizado (licença mudou) responde 409 antes de ativar pela primeira vez", async () => {
    const db = makeDb();
    await expect(new ActivateTrainingLicense(db as unknown as PrismaClient, () => now).execute("athlete-1", {
      licenseId: "lic-1", mode: "START_NOW", timezone: "America/Sao_Paulo", expectedVersion: new Date("2020-01-01").toISOString(),
    })).rejects.toMatchObject({ code: "LICENSE_ALREADY_ACTIVE" });
    expect(db.trainingLicense.update).not.toHaveBeenCalled();
  });

  it("licença de outro atleta responde LICENSE_NOT_FOUND (nunca vaza existência)", async () => {
    const db = makeDb();
    db.__setLicense({ athleteId: "athlete-OUTRO" });
    await expect(new ActivateTrainingLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "lic-1", mode: "START_NOW", timezone: "America/Sao_Paulo" }))
      .rejects.toMatchObject({ code: "LICENSE_NOT_FOUND" });
  });

  it("licença inexistente responde LICENSE_NOT_FOUND", async () => {
    const db = makeDb({ trainingLicense: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    await expect(new ActivateTrainingLicense(db as unknown as PrismaClient, () => now)
      .execute("athlete-1", { licenseId: "nope", mode: "START_NOW", timezone: "America/Sao_Paulo" }))
      .rejects.toMatchObject({ code: "LICENSE_NOT_FOUND" });
  });
});
