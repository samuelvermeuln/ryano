"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { formatDistance, formatDuration } from "@/lib/format";

/**
 * Period-over-period bar chart: one bar per bucket, with the hovered/focused
 * bucket's detail below it.
 *
 * Extracted from `components/dashboard/dashboard-redesign.tsx` — which now
 * imports it — so the coach's athlete analysis reuses the chart the athlete's own
 * dashboard already uses instead of gaining a second one that would drift in
 * scale, empty-state and motion behaviour.
 *
 * Each bar is a real `<button>`: the detail is reachable by keyboard, not only by
 * hover. `reducedMotion` is passed in rather than read here because the callers
 * already resolve it once for their whole screen.
 */
export type EvolutionBucket = {
  label: string;
  activityCount: number;
  durationSeconds: number;
  distanceMeters: number;
  /** What the bar height is proportional to — the caller chooses the dimension. */
  value: number;
  valueLabel: string;
};

export function EvolutionBars({
  data,
  peakLabel,
  reducedMotion,
}: {
  data: EvolutionBucket[];
  peakLabel: string | null;
  reducedMotion: boolean;
}) {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const max = Math.max(...data.map((item) => item.value), 1);
  const active = data.find((item) => item.label === hoveredLabel) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid h-64 grid-cols-[repeat(auto-fit,minmax(42px,1fr))] items-end gap-3">
        {data.map((bucket, index) => {
          // Empty buckets keep a visible stub so a gap in the series reads as
          // "nothing here" rather than as a missing column.
          const height = `${bucket.value > 0 ? Math.max((bucket.value / max) * 100, 10) : 6}%`;
          const highlighted = peakLabel === bucket.label && bucket.value > 0;

          return (
            <button
              key={bucket.label}
              type="button"
              aria-label={`${bucket.label}: ${bucket.valueLabel}`}
              onMouseEnter={() => setHoveredLabel(bucket.label)}
              onMouseLeave={() => setHoveredLabel((current) => (current === bucket.label ? null : current))}
              onFocus={() => setHoveredLabel(bucket.label)}
              onBlur={() => setHoveredLabel((current) => (current === bucket.label ? null : current))}
              className="flex h-full flex-col justify-end text-left"
            >
              <div className="relative flex flex-1 items-end">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height }}
                  transition={{
                    duration: reducedMotion ? 0.1 : 0.55,
                    ease: [0.22, 1, 0.36, 1],
                    delay: reducedMotion ? 0 : index * 0.04,
                  }}
                  className={`w-full rounded-t-[18px] ${
                    highlighted
                      ? "bg-[linear-gradient(180deg,rgba(96,165,250,0.95),rgba(59,130,246,0.72))]"
                      : "bg-[linear-gradient(180deg,rgba(255,255,255,0.75),rgba(255,255,255,0.18))]"
                  }`}
                />
              </div>
              <p className="mt-3 text-center text-xs leading-5 text-foreground/58">{bucket.label}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground/70">
        {active ? (
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{active.label}</p>
            <p>{active.activityCount} atividade(s)</p>
            <p>{formatDuration(active.durationSeconds)}</p>
            <p>{formatDistance(active.distanceMeters)}</p>
          </div>
        ) : peakLabel ? (
          <p>Pico do período: {peakLabel}.</p>
        ) : (
          <p>Toque em uma barra para ver detalhes.</p>
        )}
      </div>
    </div>
  );
}
