"use client";

import { useState } from "react";
import { useReducedMotion } from "motion/react";
import { EvolutionBars, type EvolutionBucket } from "@/components/charts/evolution-bars";
import { formatDistance, formatDuration } from "@/lib/format";

/**
 * SAM-11 / SAM-20 — the dimension switch over the athlete's weekly series.
 *
 * The chart itself is `components/charts/evolution-bars`, the same one the
 * athlete's own dashboard uses. Only the choice of dimension lives here: the
 * buckets arrive pre-aggregated from `GetCoachAthleteAnalysis`, so switching
 * never refetches. Volume dimensions are stacked (prescribed vs not);
 * heart rate and load are plain bars with their unit in the label.
 */
export type AnalysisWeekPoint = {
  label: string;
  prescribed: { sessions: number; durationSeconds: number; distanceMeters: number };
  unprescribed: { sessions: number; durationSeconds: number; distanceMeters: number };
  sessions: number;
  durationSeconds: number;
  distanceMeters: number;
  averageHeartRate: number | null;
  heartRateLoad: number | null;
};

const VOLUME_DIMENSIONS = [
  { id: "duration", label: "Tempo" },
  { id: "distance", label: "Distância" },
  { id: "sessions", label: "Sessões" },
] as const;

type Dimension = (typeof VOLUME_DIMENSIONS)[number]["id"] | "heartRate" | "load";

const PRESCRIBED_CLASS = "w-full bg-[linear-gradient(180deg,rgba(96,165,250,0.95),rgba(59,130,246,0.72))]";
const UNPRESCRIBED_CLASS = "w-full bg-[linear-gradient(180deg,rgba(251,191,36,0.9),rgba(245,158,11,0.7))]";

function volumeOf(slice: AnalysisWeekPoint["prescribed"], dimension: "duration" | "distance" | "sessions"): number {
  return dimension === "duration" ? slice.durationSeconds : dimension === "distance" ? slice.distanceMeters : slice.sessions;
}

function toBucket(week: AnalysisWeekPoint, dimension: Dimension): EvolutionBucket {
  const base = {
    label: week.label,
    activityCount: week.sessions,
    durationSeconds: week.durationSeconds,
    distanceMeters: week.distanceMeters,
    details: [
      `Prescrito: ${week.prescribed.sessions} sessão(ões) · ${formatDuration(week.prescribed.durationSeconds)}`,
      `Não prescrito: ${week.unprescribed.sessions} sessão(ões) · ${formatDuration(week.unprescribed.durationSeconds)}`,
      ...(week.averageHeartRate !== null ? [`FC média ${week.averageHeartRate} bpm`] : []),
      ...(week.heartRateLoad !== null ? [`Carga (hrTSS) ${week.heartRateLoad}`] : []),
    ],
  };
  if (dimension === "heartRate") {
    return { ...base, value: week.averageHeartRate ?? 0, valueLabel: week.averageHeartRate !== null ? `${week.averageHeartRate} bpm` : "sem FC" };
  }
  if (dimension === "load") {
    return { ...base, value: week.heartRateLoad ?? 0, valueLabel: week.heartRateLoad !== null ? `${week.heartRateLoad} hrTSS` : "—" };
  }
  const value = volumeOf({ sessions: week.sessions, durationSeconds: week.durationSeconds, distanceMeters: week.distanceMeters }, dimension);
  const valueLabel = dimension === "duration"
    ? formatDuration(week.durationSeconds)
    : dimension === "distance" ? formatDistance(week.distanceMeters) : `${week.sessions} sessão(ões)`;
  return {
    ...base,
    value,
    valueLabel,
    segments: [
      { value: volumeOf(week.prescribed, dimension), className: PRESCRIBED_CLASS, label: "Prescrito" },
      { value: volumeOf(week.unprescribed, dimension), className: UNPRESCRIBED_CLASS, label: "Não prescrito" },
    ],
  };
}

export function AthleteAnalysisCharts({
  weeks,
  heartRateLoadAvailable,
}: {
  weeks: AnalysisWeekPoint[];
  heartRateLoadAvailable: boolean;
}) {
  const [dimension, setDimension] = useState<Dimension>("duration");
  const reducedMotion = Boolean(useReducedMotion());
  const hasHeartRate = weeks.some((week) => week.averageHeartRate !== null);

  const options: Array<{ id: Dimension; label: string }> = [
    ...VOLUME_DIMENSIONS,
    ...(hasHeartRate ? [{ id: "heartRate" as const, label: "FC média (bpm)" }] : []),
    ...(heartRateLoadAvailable ? [{ id: "load" as const, label: "Carga (hrTSS)" }] : []),
  ];

  const buckets = weeks.map((week) => toBucket(week, dimension));
  // The peak is highlighted so a coach sees the heaviest week without reading
  // every bar; null when there is no volume at all in the window.
  const peak = buckets.reduce<EvolutionBucket | null>(
    (best, bucket) => (bucket.value > 0 && (!best || bucket.value > best.value) ? bucket : best),
    null,
  );
  const stacked = dimension !== "heartRate" && dimension !== "load";

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Dimensão do gráfico" className="flex flex-wrap gap-2">
        {options.map((option) => {
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

      {stacked && (
        <ul className="flex flex-wrap gap-4 text-xs text-foreground/60" aria-label="Legenda" data-testid="volume-legend">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-[rgba(96,165,250,0.9)]" />
            Prescrito (execução casada a uma prescrição)
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-[rgba(251,191,36,0.9)]" />
            Não prescrito (registro do atleta ou atividade importada sem prescrição)
          </li>
        </ul>
      )}
    </div>
  );
}
