/**
 * SAM-42 — Garmin → `NormalizedDailyHealth` (ADR-005).
 *
 * The daily snapshot the module already reads (`getGarminDailySnapshotForUser`:
 * `/daily-report/{date}` of the account service, cached 10 min) becomes the
 * canonical daily-health DTO: one row per local day, every metric optional,
 * Body Battery stored as the proprietary energy score WITH its label — never
 * converted to another scale. What the snapshot does not carry stays null.
 */
import type { ProviderContext, DailyHealthProvider } from "@/modules/shared/integrations/contracts";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { ProviderCapabilities } from "@/modules/shared/integrations/capabilities";
import type { ProviderAuthType } from "@/modules/shared/integrations/types";
import { normalizedDailyHealthSchema, type NormalizedDailyHealth } from "@/modules/shared/activities/contracts";
import { getGarminDailySnapshotForUser, hasGarminDailySnapshotData, type GarminDailySnapshot } from "./garmin-daily-report";

export const GARMIN_ENERGY_LABEL = "Body Battery";

function int(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value);
}

export function mapGarminSnapshotToDailyHealth(
  snapshot: GarminDailySnapshot,
  input: { date: string; timeZone: string },
): NormalizedDailyHealth {
  const hasBodyBattery = snapshot.summary.bodyBatteryHighest !== null || snapshot.summary.bodyBatteryLowest !== null;
  return normalizedDailyHealthSchema.parse({
    provider: "GARMIN",
    date: input.date,
    timeZone: input.timeZone,
    fetchedAt: snapshot.fetchedAt,
    restingHeartRate: int(snapshot.summary.restingHeartRate),
    energyHighest: int(snapshot.summary.bodyBatteryHighest),
    energyLowest: int(snapshot.summary.bodyBatteryLowest),
    energyLabel: hasBodyBattery ? GARMIN_ENERGY_LABEL : null,
    sleepScore: int(snapshot.sleep.score),
    sleepDurationSeconds: int(snapshot.sleep.durationSeconds),
    hrvLastNight: snapshot.hrv.lastNightAvg,
    hrv7dAvg: snapshot.hrv.weeklyAvg,
    hrvStatus: snapshot.hrv.status,
    readinessScore: int(snapshot.readiness.score),
    readinessLevel: snapshot.readiness.level,
    recoveryTimeMinutes: int(snapshot.readiness.recoveryTimeMinutes),
    steps: int(snapshot.summary.steps),
    activeKilocalories: int(snapshot.summary.activeKilocalories),
    totalKilocalories: int(snapshot.summary.totalKilocalories),
    raw: {
      distanceMeters: snapshot.summary.distanceMeters,
      avgSleepHrv: snapshot.sleep.avgSleepHrv,
      readinessFeedback: snapshot.readiness.feedback,
      warnings: snapshot.warnings,
    },
  });
}

function garminBaseMeta(): { capabilities: ProviderCapabilities; authType: ProviderAuthType } {
  const definition = getProviderDefinition("GARMIN");
  return {
    capabilities: (definition?.capabilities ?? { dailyHealth: true }) as ProviderCapabilities,
    authType: definition?.authType ?? "CREDENTIALS",
  };
}

/**
 * `DailyHealthProvider` of the Garmin module for the `providerRegistry`. The
 * snapshot reader resolves the account key from the vault by `userId`, so the
 * context's secrets accessor is not needed here.
 */
export function createGarminDailyHealthProvider(
  loadSnapshot: (userId: string, input: { date: string }) => Promise<GarminDailySnapshot | null> = getGarminDailySnapshotForUser,
): DailyHealthProvider {
  const { capabilities, authType } = garminBaseMeta();
  return {
    id: "GARMIN",
    capabilities,
    authType,
    async getDailyHealth(ctx: ProviderContext, input: { date: string; timeZone: string }): Promise<NormalizedDailyHealth | null> {
      const snapshot = await loadSnapshot(ctx.userId, { date: input.date });
      if (!hasGarminDailySnapshotData(snapshot)) return null;
      return mapGarminSnapshotToDailyHealth(snapshot, input);
    },
  };
}
