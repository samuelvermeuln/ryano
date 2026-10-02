"use client";

import { scaleLinear, scaleTime } from "d3-scale";
import { line as d3Line } from "d3-shape";
import { useMemo, useState } from "react";

import { formatDistance, formatDuration, formatPace, formatSwimPace } from "@/lib/format";
import type { ActivityPoint } from "@/modules/school/domain/athlete-evolution";
import { PRESCRIPTION_OUTCOME_LABELS } from "@/modules/school/presentation/workout-labels";

/**
 * SAM-44 — evolution per activity: one point per session, over time, for the
 * metric the coach picks (only metrics with data are offered); one series per
 * modality (so pool × open water read side by side), SVG from
 * `d3-scale`/`d3-shape` like the activity screen (no chart library). A point
 * with an imported activity behind it links to its detail.
 */
type MetricId = "distance" | "duration" | "pace" | "heartRate" | "maxHeartRate" | "load" | "rpe" | "strokeRate" | "distancePerStroke" | "swolf";

type Metric = {
  id: MetricId;
  label: string;
  value: (point: ActivityPoint) => number | null;
  format: (value: number, point?: ActivityPoint) => string;
  /** Lower is better (pace): the axis is inverted. */
  inverted?: boolean;
};

const METRICS: Metric[] = [
  { id: "distance", label: "Distância", value: (p) => p.distanceMeters, format: (v) => formatDistance(v) },
  { id: "duration", label: "Duração", value: (p) => p.durationSeconds, format: (v) => formatDuration(v) },
  { id: "pace", label: "Ritmo", value: (p) => p.paceSeconds, format: (v, p) => (p?.paceUnit === "per-100m" ? formatSwimPace(v) : formatPace(v)), inverted: true },
  { id: "heartRate", label: "FC média", value: (p) => p.averageHeartRate, format: (v) => `${Math.round(v)} bpm` },
  { id: "maxHeartRate", label: "FC máx.", value: (p) => p.maxHeartRate, format: (v) => `${Math.round(v)} bpm` },
  { id: "load", label: "Carga (hrTSS)", value: (p) => p.heartRateLoad, format: (v) => `${Math.round(v)}` },
  { id: "rpe", label: "Percepção (RPE)", value: (p) => p.rpe, format: (v) => `${v}/10` },
  { id: "strokeRate", label: "Braçadas/min", value: (p) => p.strokeRate, format: (v) => `${Math.round(v)} spm` },
  { id: "distancePerStroke", label: "Distância por braçada", value: (p) => p.distancePerStroke, format: (v) => `${(Math.round(v * 100) / 100).toLocaleString("pt-BR")} m` },
  { id: "swolf", label: "SWOLF", value: (p) => p.swolf, format: (v) => `${Math.round(v)}`, inverted: true },
];

const SERIES_COLORS = ["--chart-pace", "--chart-heart-rate", "--chart-power", "--chart-altitude", "--chart-cadence", "--chart-temperature"];
const W = 640;
const H = 220;
const PAD = { left: 8, right: 8, top: 10, bottom: 24 };

function dayLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

export function ActivityEvolutionCharts({
  points,
  sportLabels,
  activityBaseHref,
}: {
  points: ActivityPoint[];
  sportLabels: Record<string, string>;
  /**
   * Base of the activity detail route for this reader (`${base}/${activityId}`,
   * SAM-34/40); null when the reader has no such route. A string, not a
   * function: this is a Client Component fed by a Server Component.
   */
  activityBaseHref: string | null;
}) {
  // A metric is offered when at least two points carry it (one point is not an evolution).
  const available = useMemo(() => METRICS.filter((metric) => points.filter((point) => metric.value(point) !== null).length >= 2), [points]);
  const [metricId, setMetricId] = useState<MetricId>(available[0]?.id ?? "distance");
  const metric = available.find((candidate) => candidate.id === metricId) ?? available[0];

  const chart = useMemo(() => {
    if (!metric) return null;
    const withValue = points.filter((point) => metric.value(point) !== null);
    if (withValue.length < 2) return null;
    const times = withValue.map((point) => new Date(point.startedAt).getTime());
    const values = withValue.map((point) => metric.value(point)!);
    const x = scaleTime().domain([Math.min(...times), Math.max(...times)]).range([PAD.left, W - PAD.right]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const y = scaleLinear().domain([min, max === min ? min + 1 : max]).range(metric.inverted ? [PAD.top, H - PAD.bottom] : [H - PAD.bottom, PAD.top]);
    const sports = [...new Set(withValue.map((point) => point.sportType))];
    const series = sports.map((sport, index) => {
      const own = withValue.filter((point) => point.sportType === sport);
      const path = d3Line<ActivityPoint>()
        .x((point) => x(new Date(point.startedAt).getTime()))
        .y((point) => y(metric.value(point)!))(own) ?? "";
      return { sport, colorVar: SERIES_COLORS[index % SERIES_COLORS.length]!, path, points: own };
    });
    return { x, y, series, min, max, first: withValue[0]!, last: withValue[withValue.length - 1]! };
  }, [metric, points]);

  if (!metric || !chart) {
    return <p className="text-sm text-foreground/50" data-testid="activity-evolution-empty">Ainda não há métricas suficientes para traçar a evolução (são precisas ao menos duas sessões com o mesmo dado).</p>;
  }

  return (
    <div className="space-y-3" data-testid="activity-evolution">
      <div role="group" aria-label="Métrica da evolução" className="flex flex-wrap gap-1">
        {available.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === metric.id}
            onClick={() => setMetricId(candidate.id)}
            className={`rounded-full border px-3 py-1 text-xs ${candidate.id === metric.id ? "theme-pill-success font-medium" : "theme-pill-neutral"}`}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-foreground/55">
        <span>{metric.inverted ? "melhor ↑" : "maior ↑"} · mín. {metric.format(chart.min, chart.first)} · máx. {metric.format(chart.max, chart.last)}</span>
        <span className="flex flex-wrap gap-3">
          {chart.series.map((series) => (
            <span key={series.sport} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: `var(${series.colorVar})` }} />
              {sportLabels[series.sport] ?? series.sport}
            </span>
          ))}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label={`${metric.label} por atividade ao longo do período`}>
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--chart-grid)" />
        <text x={PAD.left} y={H - 6} fontSize={11} fill="currentColor" opacity={0.55}>{dayLabel(chart.first.date)}</text>
        <text x={W - PAD.right} y={H - 6} fontSize={11} fill="currentColor" opacity={0.55} textAnchor="end">{dayLabel(chart.last.date)}</text>
        {chart.series.map((series) => (
          <g key={series.sport}>
            <path d={series.path} fill="none" stroke={`var(${series.colorVar})`} strokeWidth={1.5} strokeOpacity={0.6} strokeLinejoin="round" />
            {series.points.map((point) => {
              const cx = chart.x(new Date(point.startedAt).getTime());
              const cy = chart.y(metric.value(point)!);
              const title = `${dayLabel(point.date)} · ${sportLabels[point.sportType] ?? point.sportType} · ${metric.format(metric.value(point)!, point)}${point.outcome ? ` · ${PRESCRIPTION_OUTCOME_LABELS[point.outcome]}` : ""}`;
              const dot = (
                <circle
                  cx={cx} cy={cy} r={5}
                  fill={`var(${series.colorVar})`}
                  stroke="var(--background)" strokeWidth={1.5}
                  data-testid="activity-evolution-point"
                  data-outcome={point.outcome ?? undefined}
                />
              );
              const href = point.activityId && activityBaseHref ? `${activityBaseHref}/${point.activityId}` : null;
              return href ? (
                <a key={point.id} href={href} aria-label={title}><title>{title}</title>{dot}</a>
              ) : (
                <g key={point.id}><title>{title}</title>{dot}</g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
