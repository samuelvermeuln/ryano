/**
 * SAM-43 — the athlete's "current state" for whoever reads it (coach in a
 * school, independent coach, the school's administration, or the athlete):
 * today's daily health, the 7-day averages and a 4-week series, read from
 * `AthleteDailyHealth` (SAM-42) and resolved one source per field (SAM-45).
 *
 * Rules:
 * - Who may read is `ResolveActivityReaderContext`; days before the link's
 *   `periodStart` need the `metrics` consent category (ADR-005) — the
 *   `CanReadAthleteHistory` resolver answers per date; withheld days are
 *   counted so the screen can say the rest depends on the athlete.
 * - Nothing is mandatory: without any connection whose provider declares
 *   `dailyHealth`, `available` is false and the section is omitted. With a
 *   connection but no row yet, the cards are empty, never zero.
 * - Values stay as the provider sent them; a proprietary score keeps its label.
 */
import type { PrismaClient } from "@prisma/client";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { ProviderId } from "@/modules/shared/integrations/types";
import type { DailyHealthField } from "@/modules/shared/activities/contracts";
import { loadResolvedDailyHealthRange } from "@/modules/shared/health";
import type { ResolvedDailyHealth } from "@/modules/shared/activities/source-resolution";
import { addCalendarDays, localMidnightToUtc, todayLocalDate } from "../domain/local-date";
import { ResolveActivityReaderContext, type ActivityReaderScopeInput } from "./activity-reader-context";
import { CanReadAthleteHistory } from "./can-read-athlete-history";

export const CURRENT_STATE_SERIES_DAYS = 28;
export const CURRENT_STATE_AVERAGE_DAYS = 7;

export const CURRENT_STATE_METRICS = ["restingHeartRate", "energyHighest", "sleepScore", "hrvLastNight"] as const satisfies readonly DailyHealthField[];
export type CurrentStateMetric = (typeof CURRENT_STATE_METRICS)[number];

export type CurrentStatePoint = { date: string } & Partial<Record<CurrentStateMetric, number>>;

export type AthleteCurrentState = {
  /** False when no connected provider declares `dailyHealth`: the section is omitted. */
  available: boolean;
  today: string;
  /** Today's resolved values (`sources` says who measured each). */
  current: ResolvedDailyHealth | null;
  /** Mean of the last 7 readable days, per metric present. */
  averages7d: Partial<Record<CurrentStateMetric, number>>;
  /** Oldest → newest, one point per readable day with a row. */
  series: CurrentStatePoint[];
  /** Label of the proprietary energy score (e.g. "Body Battery"), from the day that has it. */
  energyLabel: string | null;
  /** Days of the window the reader may not see (before the link, no `metrics` consent). */
  withheldDays: number;
  /** Provider ids with a health capability among the athlete's connections. */
  providers: ProviderId[];
};

type StateDb = PrismaClient;

function hasDailyHealthCapability(providerId: string): boolean {
  return getProviderDefinition(providerId as ProviderId)?.capabilities.dailyHealth === true;
}

function mean(values: number[]): number | undefined {
  return values.length > 0 ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : undefined;
}

export class GetAthleteCurrentState {
  constructor(private readonly db: StateDb, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, scope: ActivityReaderScopeInput, athleteId: string): Promise<AthleteCurrentState> {
    const context = await new ResolveActivityReaderContext(this.db, this.clock).execute(actorUserId, scope, athleteId);
    const now = this.clock();
    const today = todayLocalDate(now, context.timeZone);
    const from = addCalendarDays(today, -(CURRENT_STATE_SERIES_DAYS - 1));

    const connections = await this.db.wearableConnection.findMany({
      where: { userId: athleteId, status: { not: "DISCONNECTED" } },
      select: { provider: true },
    });
    const providers = connections.map((row) => row.provider as ProviderId).filter(hasDailyHealthCapability);
    if (providers.length === 0) {
      return { available: false, today, current: null, averages7d: {}, series: [], energyLabel: null, withheldDays: 0, providers: [] };
    }

    const historyAllowed = context.reader === "athlete"
      ? () => true
      : await new CanReadAthleteHistory(this.db, this.clock)
        .resolver(actorUserId, { athleteId, schoolId: context.schoolId, category: "metrics" });
    const readable = (date: string) => {
      const instant = localMidnightToUtc(date, context.timeZone);
      return instant >= context.periodStart || historyAllowed(instant);
    };

    const days = await loadResolvedDailyHealthRange(this.db, athleteId, { from, to: today }, { preferred: providers });
    let withheldDays = 0;
    const visible = days.filter((day) => {
      if (readable(day.date)) return true;
      withheldDays += 1;
      return false;
    });

    const series: CurrentStatePoint[] = visible.map((day) => {
      const point: CurrentStatePoint = { date: day.date };
      for (const metric of CURRENT_STATE_METRICS) {
        const value = day.values[metric];
        if (typeof value === "number") point[metric] = value;
      }
      return point;
    });

    const averageFrom = addCalendarDays(today, -(CURRENT_STATE_AVERAGE_DAYS - 1));
    const lastWeek = series.filter((point) => point.date >= averageFrom);
    const averages7d: AthleteCurrentState["averages7d"] = {};
    for (const metric of CURRENT_STATE_METRICS) {
      const average = mean(lastWeek.map((point) => point[metric]).filter((value): value is number => typeof value === "number"));
      if (average !== undefined) averages7d[metric] = average;
    }

    const current = visible.find((day) => day.date === today) ?? null;
    const energyLabel = [...visible].reverse().map((day) => day.values.energyLabel).find((label): label is string => typeof label === "string") ?? null;

    return { available: true, today, current, averages7d, series, energyLabel, withheldDays, providers };
  }
}
