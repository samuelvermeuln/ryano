/**
 * SAM-50 — level per (modality, environment) on the technical sheet (§4.2):
 * advanced in a pool, beginner at sea; assessed on a date by a professional;
 * replaced as a set on save with a before/after revision; never derived.
 */
import { describe, expect, it, vi } from "vitest";

import { athleteSportLevelsInputSchema } from "@/modules/school/domain/athlete-sport-level";
import { SaveAthleteTechnicalSheet } from "@/modules/school/application/save-athlete-technical-sheet";
import { formatTrackedValue } from "@/modules/school/presentation/prescription-targets";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const PERIOD_START = new Date("2026-01-01T00:00:00.000Z");

describe("athleteSportLevelsInputSchema", () => {
  it("aceita piscina avançado e mar iniciante para a mesma natação", () => {
    const rows = athleteSportLevelsInputSchema.parse([
      { sportType: "swim", environment: "POOL_SHORT", level: "ADVANCED", assessedAt: "2026-09-10" },
      { sportType: "open-water", environment: "SEA", level: "BEGINNER", currentCondition: "voltando de pausa" },
    ]);
    expect(rows.map((row) => `${row.sportType}:${row.environment}:${row.level}`)).toEqual(["swim:POOL_SHORT:ADVANCED", "open-water:SEA:BEGINNER"]);
    expect(rows[0]!.assessedAt?.toISOString().slice(0, 10)).toBe("2026-09-10");
    expect(rows[1]!.eventExperience).toBeNull();
  });

  it("recusa a mesma modalidade e ambiente duas vezes, nível fora da lista e ambiente inventado", () => {
    expect(() => athleteSportLevelsInputSchema.parse([
      { sportType: "run", environment: "ROAD", level: "BEGINNER" },
      { sportType: "run", environment: "ROAD", level: "ADVANCED" },
    ])).toThrow(/já têm um nível/);
    expect(() => athleteSportLevelsInputSchema.parse([{ sportType: "run", environment: "ROAD", level: "ELITE_PLUS" }])).toThrow();
    expect(() => athleteSportLevelsInputSchema.parse([{ sportType: "run", environment: "MOON", level: "BEGINNER" }])).toThrow();
  });
});

function makeDb(previousLevels: Array<Record<string, unknown>> = []) {
  const tx = {
    athleteTechnicalSheet: {
      findUnique: vi.fn().mockResolvedValue({ id: "sheet", maxHeartRate: null, thresholdHeartRate: null, restingHeartRate: null, thresholdPaceSecPerKm: null, ftpWatts: null, cssSecPer100m: null, heartRateZoneMethod: null }),
      upsert: vi.fn().mockResolvedValue({ id: "sheet" }),
    },
    athleteSportLevel: {
      findMany: vi.fn().mockResolvedValue(previousLevels),
      deleteMany: vi.fn().mockResolvedValue({ count: previousLevels.length }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    athleteTechnicalSheetRevision: { create: vi.fn().mockResolvedValue({}) },
    schoolAuditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const db = {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school", name: "Escola", status: "ACTIVE" }) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE" }) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "m" }) },
    schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue({ startedAt: PERIOD_START, createdAt: PERIOD_START }) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "athlete", name: "Ana", email: "ana@x.com", image: null }) },
    coachAthleteAssignment: {
      findFirst: vi.fn().mockImplementation((args: { where: Record<string, unknown> }) => Promise.resolve(
        args.where.isPrimary === true ? { coachId: "coach", coach: { displayName: null, user: { name: "Carlos" } } } : { id: "a" },
      )),
    },
    teamAthlete: { findMany: vi.fn().mockResolvedValue([]) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockImplementation((fn: (client: unknown) => unknown) => fn(tx)),
  };
  return { db, tx };
}

describe("SaveAthleteTechnicalSheet — níveis por modalidade (SAM-50)", () => {
  it("substitui os níveis, registra o avaliador e grava a revisão com antes/depois", async () => {
    const { db, tx } = makeDb([
      { sportType: "swim", environment: "POOL_SHORT", level: "INTERMEDIATE", assessedAt: new Date("2026-03-01"), assessedByUserId: "old-coach" },
    ]);
    await new SaveAthleteTechnicalSheet(db as never, () => NOW).execute("coach-user", "school", "athlete", {
      sportLevels: [
        { sportType: "swim", environment: "POOL_SHORT", level: "ADVANCED", assessedAt: "2026-09-10" },
        { sportType: "open-water", environment: "SEA", level: "BEGINNER" },
      ],
    });

    expect(tx.athleteSportLevel.deleteMany).toHaveBeenCalledWith({ where: { sheetId: "sheet" } });
    const created = tx.athleteSportLevel.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(created.map((row) => [row.sportType, row.environment, row.level, row.assessedByUserId])).toEqual([
      ["swim", "POOL_SHORT", "ADVANCED", "coach-user"],
      ["open-water", "SEA", "BEGINNER", "coach-user"],
    ]);
    const changes = tx.athleteTechnicalSheetRevision.create.mock.calls[0][0].data.changes;
    expect(changes.sportLevels.from).toEqual([{ sportType: "swim", environment: "POOL_SHORT", level: "INTERMEDIATE", assessedAt: "2026-03-01" }]);
    expect(changes.sportLevels.to).toHaveLength(2);
  });

  it("nível sem mudança mantém quem avaliou e não gera revisão", async () => {
    const { db, tx } = makeDb([
      { sportType: "run", environment: "ROAD", level: "ADVANCED", assessedAt: new Date("2026-05-02"), assessedByUserId: "old-coach" },
    ]);
    await new SaveAthleteTechnicalSheet(db as never, () => NOW).execute("coach-user", "school", "athlete", {
      sportLevels: [{ sportType: "run", environment: "ROAD", level: "ADVANCED", assessedAt: "2026-05-02", notes: "nova nota" }],
    });
    const created = tx.athleteSportLevel.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(created[0]!.assessedByUserId).toBe("old-coach");
    expect(tx.athleteTechnicalSheetRevision.create).not.toHaveBeenCalled();
  });

  it("sem a chave sportLevels, os níveis não são tocados", async () => {
    const { db, tx } = makeDb();
    await new SaveAthleteTechnicalSheet(db as never, () => NOW).execute("coach-user", "school", "athlete", { goals: "x" });
    expect(tx.athleteSportLevel.deleteMany).not.toHaveBeenCalled();
    expect(tx.athleteSportLevel.createMany).not.toHaveBeenCalled();
  });

  it("a revisão é legível para o professor", () => {
    expect(formatTrackedValue("sportLevels", [{ sportType: "open-water", environment: "SEA", level: "BEGINNER" }])).toBe("Águas Abertas · Mar: Iniciante");
    expect(formatTrackedValue("sportLevels", [])).toBe("nenhum");
  });
});
