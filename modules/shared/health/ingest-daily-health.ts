/**
 * SAM-42 — the daily-health ingestion job (provider-agnostic).
 *
 * For every connected connection whose provider declares `dailyHealth` in
 * the catalog AND whose registered module implements `DailyHealthProvider`,
 * asks the module for the athlete's local day and upserts ONE row per
 * `(userId, provider, date)`. Re-running updates in place (never duplicates).
 * Connections are isolated: one provider's failure is logged (no values, no
 * PII) and never stops the others. A provider without the capability (Strava)
 * is never called.
 */
import type { Prisma, PrismaClient, WearableProvider } from "@prisma/client";
import type { NormalizedDailyHealth } from "../activities/contracts";
// Side effect: registers the catalog's capability resolver so `hasCapability` answers here too.
import "../integrations/catalog";
import { hasCapability } from "../integrations/capabilities";
import type { DailyHealthProvider, ProviderModule } from "../integrations/contracts";
import { logIntegrationEvent } from "../integrations/observability/log";
import { createVaultSecretsAccessor } from "../integrations/secrets/vault-secrets-accessor";
import type { ProviderId } from "../integrations/types";
import { resolveAthleteTimeZone } from "@/modules/school/application/athlete-time-zone";
import { todayLocalDate } from "@/modules/school/domain/local-date";

export const DAILY_HEALTH_OPERATION = "daily_health_ingestion";

type IngestionDb = Pick<PrismaClient, "wearableConnection" | "athleteDailyHealth" | "wearableSecret" | "notificationPreference">;

export type IngestDailyHealthInput = {
  /** Local day to ingest; default: each athlete's today. */
  date?: string;
  /** Restrict to one athlete. */
  userId?: string;
  /** Restrict to one provider. */
  provider?: ProviderId;
};

export type IngestDailyHealthResult = {
  considered: number;
  ingested: number;
  /** Connections whose provider has no data for the day. */
  empty: number;
  failed: number;
  skipped: number;
};

export function dailyHealthToRow(health: NormalizedDailyHealth) {
  const { provider, date, timeZone, fetchedAt, raw, ...metrics } = health;
  return {
    provider: provider as WearableProvider,
    date,
    timeZone,
    fetchedAt,
    ...metrics,
    raw: raw === undefined ? undefined : (raw as Prisma.InputJsonValue),
  };
}

export class IngestDailyHealth {
  constructor(
    private readonly db: IngestionDb,
    private readonly registry: Partial<Record<ProviderId, ProviderModule>>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: IngestDailyHealthInput = {}): Promise<IngestDailyHealthResult> {
    const result: IngestDailyHealthResult = { considered: 0, ingested: 0, empty: 0, failed: 0, skipped: 0 };
    const connections = await this.db.wearableConnection.findMany({
      where: {
        status: "CONNECTED",
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.provider ? { provider: input.provider as WearableProvider } : {}),
      },
      select: { id: true, userId: true, provider: true },
      orderBy: [{ userId: "asc" }, { provider: "asc" }],
    });

    for (const connection of connections) {
      const providerId = connection.provider as ProviderId;
      result.considered += 1;
      const provider = this.registry[providerId]?.dailyHealth;
      if (!provider || !hasCapability(providerId, "dailyHealth")) {
        result.skipped += 1;
        continue;
      }
      try {
        const timeZone = await resolveAthleteTimeZone(this.db, connection.userId);
        const date = input.date ?? todayLocalDate(this.clock(), timeZone);
        const health = await this.ingestOne(provider, connection, { date, timeZone });
        if (health) result.ingested += 1;
        else result.empty += 1;
      } catch (error) {
        result.failed += 1;
        logIntegrationEvent("warn", "Daily health ingestion failed", {
          provider: providerId, operation: DAILY_HEALTH_OPERATION, status: "error",
          connectionId: connection.id, errorName: error instanceof Error ? error.name : "Error",
        });
      }
    }
    return result;
  }

  private async ingestOne(
    provider: DailyHealthProvider,
    connection: { id: string; userId: string; provider: WearableProvider },
    day: { date: string; timeZone: string },
  ): Promise<NormalizedDailyHealth | null> {
    const health = await provider.getDailyHealth(
      { userId: connection.userId, connectionId: connection.id, secrets: createVaultSecretsAccessor(this.db, connection.id) },
      day,
    );
    const providerId = connection.provider as ProviderId;
    if (!health) {
      logIntegrationEvent("info", "Daily health unavailable", {
        provider: providerId, operation: DAILY_HEALTH_OPERATION, status: "no_data", connectionId: connection.id,
      });
      return null;
    }
    const row = dailyHealthToRow(health);
    await this.db.athleteDailyHealth.upsert({
      where: { userId_provider_date: { userId: connection.userId, provider: row.provider, date: row.date } },
      create: { userId: connection.userId, ...row },
      update: row,
    });
    logIntegrationEvent("info", "Daily health ingested", {
      provider: providerId, operation: DAILY_HEALTH_OPERATION, status: "ok", connectionId: connection.id, date: row.date,
    });
    return health;
  }
}
