import { formatDuration, formatHeartRate } from "@/lib/format";
import type { AthleteCurrentState, CurrentStateMetric } from "@/modules/school/application/get-athlete-current-state";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { ProviderId } from "@/modules/shared/integrations/types";
import { Sparkline } from "./health-visuals";

/**
 * SAM-43 — "Estado atual": resting HR, the provider's energy score, sleep and
 * HRV, each with today's value, the 7-day average, a 4-week sparkline and
 * the source of the value. Card by card: a metric nobody measured is simply
 * not shown; a proprietary score shows the provider's own name. Server
 * Component.
 */
function providerLabel(providerId: string | undefined): string | null {
  if (!providerId) return null;
  return getProviderDefinition(providerId as ProviderId)?.name ?? providerId;
}

type CardSpec = {
  metric: CurrentStateMetric;
  title: (state: AthleteCurrentState) => string;
  format: (value: number) => string;
  colorVar: string;
  /** Extra line under the value (e.g. sleep duration, HRV status). */
  detail?: (state: AthleteCurrentState) => string | null;
};

const CARDS: CardSpec[] = [
  { metric: "restingHeartRate", title: () => "FC de repouso", format: (value) => formatHeartRate(value), colorVar: "--chart-heart-rate" },
  {
    metric: "energyHighest",
    title: (state) => state.energyLabel ?? "Energia",
    format: (value) => `${Math.round(value)}`,
    colorVar: "--chart-power",
    detail: (state) => {
      const low = state.current?.values.energyLowest;
      return typeof low === "number" ? `mín. do dia ${Math.round(low)}` : null;
    },
  },
  {
    metric: "sleepScore",
    title: () => "Sono",
    format: (value) => `${Math.round(value)}`,
    colorVar: "--chart-pace",
    detail: (state) => {
      const seconds = state.current?.values.sleepDurationSeconds;
      return typeof seconds === "number" ? formatDuration(seconds) : null;
    },
  },
  {
    metric: "hrvLastNight",
    title: () => "VFC (última noite)",
    format: (value) => `${Math.round(value)} ms`,
    colorVar: "--chart-altitude",
    detail: (state) => state.current?.values.hrvStatus ?? null,
  },
];

export function CurrentStateCards({ state }: { state: AthleteCurrentState }) {
  const cards = CARDS.filter((card) =>
    typeof state.current?.values[card.metric] === "number" || state.series.some((point) => typeof point[card.metric] === "number"));
  if (cards.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="current-state">
      {cards.map((card) => {
        const today = state.current?.values[card.metric];
        const average = state.averages7d[card.metric];
        const source = providerLabel(state.current?.sources[card.metric]);
        const detail = card.detail?.(state);
        return (
          <article key={card.metric} className="rounded-[20px] border border-border theme-panel-neutral p-4" data-testid={`current-state-${card.metric}`}>
            <p className="text-xs uppercase tracking-[0.14em] text-foreground/55">{card.title(state)}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
              {typeof today === "number" ? card.format(today) : <span className="text-foreground/40">sem leitura hoje</span>}
            </p>
            {detail && <p className="text-xs text-foreground/60">{detail}</p>}
            <p className="mt-1 text-xs text-foreground/55">
              {typeof average === "number" ? `média 7 dias ${card.format(average)}` : "sem média de 7 dias"}
            </p>
            <div className="mt-2">
              <Sparkline
                values={state.series.map((point) => (typeof point[card.metric] === "number" ? (point[card.metric] as number) : null))}
                colorVar={card.colorVar}
                label={`${card.title(state)} nas últimas 4 semanas`}
              />
            </div>
            {source && <p className="mt-1 text-[11px] text-foreground/50" data-testid="current-state-source">{card.title(state)}: {source}</p>}
          </article>
        );
      })}
    </div>
  );
}
