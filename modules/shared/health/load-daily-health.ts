/**
 * SAM-42 — persisted daily health back into the canonical DTOs, and the
 * resolution of ONE value per field across the athlete's connections
 * (`resolveDailyHealthSources`, SAM-45). Readers consume the resolved day
 * with its `sources`; nothing here knows a provider.
 */
import type { AthleteDailyHealth, PrismaClient } from "@prisma/client";
import { normalizedDailyHealthSchema, type NormalizedDailyHealth } from "../activities/contracts";
import { resolveDailyHealthSources, type ResolvedDailyHealth } from "../activities/source-resolution";
import type { ProviderId } from "../integrations/types";

export function rowToDailyHealth(row: AthleteDailyHealth): NormalizedDailyHealth {
  return normalizedDailyHealthSchema.parse({
    provider: row.provider,
    date: row.date,
    timeZone: row.timeZone,
    fetchedAt: row.fetchedAt,
    restingHeartRate: row.restingHeartRate,
    restingHeartRate7dAvg: row.restingHeartRate7dAvg,
    energyScore: row.energyScore,
    energyHighest: row.energyHighest,
    energyLowest: row.energyLowest,
    energyLabel: row.energyLabel,
    sleepScore: row.sleepScore,
    sleepDurationSeconds: row.sleepDurationSeconds,
    sleepStart: row.sleepStart,
    sleepEnd: row.sleepEnd,
    deepSleepSeconds: row.deepSleepSeconds,
    lightSleepSeconds: row.lightSleepSeconds,
    remSleepSeconds: row.remSleepSeconds,
    awakeSeconds: row.awakeSeconds,
    hrvLastNight: row.hrvLastNight,
    hrv7dAvg: row.hrv7dAvg,
    hrvStatus: row.hrvStatus,
    readinessScore: row.readinessScore,
    readinessLevel: row.readinessLevel,
    recoveryTimeMinutes: row.recoveryTimeMinutes,
    steps: row.steps,
    activeKilocalories: row.activeKilocalories,
    totalKilocalories: row.totalKilocalories,
    raw: row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? (row.raw as Record<string, unknown>) : undefined,
  });
}

type HealthDb = Pick<PrismaClient, "athleteDailyHealth">;

/** Every connection's record for one local day. */
export async function loadDailyHealthRecords(db: HealthDb, userId: string, date: string): Promise<NormalizedDailyHealth[]> {
  const rows = await db.athleteDailyHealth.findMany({ where: { userId, date }, orderBy: { fetchedAt: "desc" } });
  return rows.map(rowToDailyHealth);
}

/** One resolved day (one source per field), or null when nothing was ingested for it. */
export async function loadResolvedDailyHealth(
  db: HealthDb,
  userId: string,
  date: string,
  options: { preferred?: readonly ProviderId[] } = {},
): Promise<ResolvedDailyHealth | null> {
  const records = await loadDailyHealthRecords(db, userId, date);
  return resolveDailyHealthSources(records, options);
}

/** A range of resolved days, oldest first; days without any record are absent (never zero-filled). */
export async function loadResolvedDailyHealthRange(
  db: HealthDb,
  userId: string,
  range: { from: string; to: string },
  options: { preferred?: readonly ProviderId[] } = {},
): Promise<ResolvedDailyHealth[]> {
  const rows = await db.athleteDailyHealth.findMany({
    where: { userId, date: { gte: range.from, lte: range.to } },
    orderBy: [{ date: "asc" }, { fetchedAt: "desc" }],
  });
  const byDate = new Map<string, NormalizedDailyHealth[]>();
  for (const row of rows) {
    const list = byDate.get(row.date) ?? [];
    list.push(rowToDailyHealth(row));
    byDate.set(row.date, list);
  }
  return [...byDate.values()]
    .map((records) => resolveDailyHealthSources(records, options))
    .filter((resolved): resolved is ResolvedDailyHealth => resolved !== null);
}
