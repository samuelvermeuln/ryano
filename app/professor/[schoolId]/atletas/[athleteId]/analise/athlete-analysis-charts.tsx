"use client";

import { useState } from "react";
import { useReducedMotion } from "motion/react";
import { EvolutionBars, type EvolutionBucket } from "@/components/charts/evolution-bars";
import { formatDistance, formatDuration } from "@/lib/format";

/**
 * SAM-11 — the dimension switch over the athlete's weekly volume.
 *
 * The chart itself is `components/charts/evolution-bars`, the same one the
 * athlete's own dashboard uses. Only the choice of dimension lives here, and only
 * because it is the one genuinely interactive bit: the buckets arrive
 * pre-aggregated from `GetCoachAthleteAnalysis`, so switching dimension never
 * refetches.
 */
export type AnalysisWeekPoint = {
  label: string;
  sessions: number;
  durationSeconds: number;
  distanceMeters: number;
};

const DIMENSIONS = [
  { id: "duration", label: "Tempo" },
  { id: "distance", label: "Distância" },
  { id: "sessions", label: "Sessões" },
] as const;

type Dimension = (typeof DIMENSIONS)[number]["id"];

function toBucket(week: AnalysisWeekPoint, dimension: Dimension): EvolutionBucket {
  const value = dimension === "duration"
    ? week.durationSeconds
    : dimension === "distance" ? week.distanceMeters : week.sessions;
  const valueLabel = dimension === "duration"
    ? formatDuration(week.durationSeconds)
    : dimension === "distance" ? formatDistance(week.distanceMeters) : `${week.sessions} sessão(ões)`;
  return {
    label: week.label,
    activityCount: week.sessions,
    durationSeconds: week.durationSeconds,
    distanceMeters: week.distanceMeters,
    value,
    valueLabel,
  };
}

export function AthleteAnalysisCharts({ weeks }: { weeks: AnalysisWeekPoint[] }) {
  const [dimension, setDimension] = useState<Dimension>("duration");
  const reducedMotion = Boolean(useReducedMotion());

  const buckets = weeks.map((week) => toBucket(week, dimension));
  // The peak is highlighted so a coach sees the heaviest week without reading
  // every bar; null when there is no volume at all in the window.
  const peak = buckets.reduce<EvolutionBucket | null>(
    (best, bucket) => (bucket.value > 0 && (!best || bucket.value > best.value) ? bucket : best),
    null,
  );

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Dimensão do gráfico" className="flex flex-wrap gap-2">
        {DIMENSIONS.map((option) => {
          const isActive = option.id === dimension;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setDimension(option.id)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                isActive
                  ? "theme-pill-info font-medium"
                  : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10 hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <EvolutionBars data={buckets} peakLabel={peak?.label ?? null} reducedMotion={reducedMotion} />
    </div>
  );
}
