/**
 * SAM-17 — the execution → activity link: the same (UPPER(source), externalId,
 * athleteId) rule the migration backfill uses, applied at match time.
 */
import { describe, expect, it, vi } from "vitest";
import { CLEARED_MATCH, matchedActivityData, resolveActivityId, toWearableProvider } from "@/modules/school/infrastructure/activity-link";

describe("toWearableProvider", () => {
  it("normaliza a caixa do source para o enum do provedor", () => {
    expect(toWearableProvider("strava")).toBe("STRAVA");
    expect(toWearableProvider("GARMIN")).toBe("GARMIN");
    expect(toWearableProvider(" garmin ")).toBe("GARMIN");
  });

  it("fontes que não são provedor (auto-relato, seed) não viram atividade", () => {
    expect(toWearableProvider("self-report")).toBeNull();
    expect(toWearableProvider("MANUAL")).toBeNull();
    expect(toWearableProvider("")).toBeNull();
  });
});

describe("resolveActivityId", () => {
  it("consulta pela chave única (provider, externalId, userId) e devolve o id", async () => {
    const db = { activity: { findUnique: vi.fn().mockResolvedValue({ id: "act-1" }) } };
    await expect(resolveActivityId(db as never, { source: "strava", externalId: "123", athleteId: "u" })).resolves.toBe("act-1");
    expect(db.activity.findUnique).toHaveBeenCalledWith({
      where: { provider_externalId_userId: { provider: "STRAVA", externalId: "123", userId: "u" } },
      select: { id: true },
    });
  });

  it("não consulta o banco para fontes sem provedor; atividade ausente devolve null", async () => {
    const db = { activity: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(resolveActivityId(db as never, { source: "self-report", externalId: "x", athleteId: "u" })).resolves.toBeNull();
    expect(db.activity.findUnique).not.toHaveBeenCalled();
    await expect(resolveActivityId(db as never, { source: "garmin", externalId: "x", athleteId: "u" })).resolves.toBeNull();
  });
});

describe("matchedActivityData / CLEARED_MATCH", () => {
  it("espelha a execução no ponteiro da prescrição e o limpa por inteiro", () => {
    const now = new Date("2026-10-10T00:00:00.000Z");
    expect(matchedActivityData({ activityId: "act", matchStatus: "AUTO_MATCHED", matchScore: 88 }, now))
      .toEqual({ matchedActivityId: "act", matchStatus: "AUTO_MATCHED", matchedAt: now, matchScore: 88 });
    expect(CLEARED_MATCH).toEqual({ matchedActivityId: null, matchStatus: null, matchedAt: null, matchScore: null });
  });
});
