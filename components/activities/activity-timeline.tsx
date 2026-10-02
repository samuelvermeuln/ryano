"use client";

import { scaleLinear } from "d3-scale";
import { line as d3Line } from "d3-shape";
import { useCallback, useMemo, useRef, useState, type PointerEvent } from "react";

import { formatDistance, formatDurationClock } from "@/lib/format";
import {
  formatSeriesValue,
  type ActivityRoute,
  type ActivityTimeline as ActivityTimelineModel,
  type TimelineSeries,
} from "@/modules/shared/activities/presentation/activity-detail-model";

/**
 * SAM-40 — route trace + stacked, synchronised time-series charts.
 *
 * Why no map/chart library: the route is drawn as an SVG trace (equirectangular
 * projection fitted to the box, start/end markers, no tiles) and the charts are
 * SVG paths from `d3-shape`/`d3-scale`, which the repo already ships. That keeps
 * the page offline-safe, free of tile licences and of ~150 KB of map runtime,
 * and themed by CSS tokens in both modes. Tiles can be layered later behind
 * the same trace without changing the model.
 *
 * Gaps in a series (`null`) stay gaps: `line().defined` breaks the path.
 * Hovering any chart moves one guide across all of them and the marker on the
 * route (when the route samples are the timeline samples).
 */

const CHART_W = 640;
const CHART_H = 120;
const ROUTE_W = 640;
const ROUTE_H = 320;
const PAD = 8;

type Axis = "time" | "distance";

function nearestIndex(values: number[], target: number): number {
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid]! < target) low = mid + 1;
    else high = mid;
  }
  if (low > 0 && Math.abs(values[low - 1]! - target) < Math.abs(values[low]! - target)) return low - 1;
  return low;
}

function seriesStats(series: TimelineSeries) {
  const present = series.values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  const min = Math.min(...present);
  const max = Math.max(...present);
  const avg = present.reduce((sum, value) => sum + value, 0) / present.length;
  return { min, max, avg };
}

function RouteTrace({ route, hoverIndex, hoverFraction }: { route: ActivityRoute; hoverIndex: number | null; hoverFraction: number | null }) {
  const projected = useMemo(() => {
    const valid = route.points.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    if (valid.length < 2) return null;
    const meanLat = valid.reduce((sum, point) => sum + point[0], 0) / valid.length;
    const kx = Math.cos((meanLat * Math.PI) / 180);
    const xs = valid.map((point) => point[1] * kx);
    const ys = valid.map((point) => point[0]);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1e-6);
    const spanY = Math.max(maxY - minY, 1e-6);
    const scale = Math.min((ROUTE_W - 2 * PAD * 3) / spanX, (ROUTE_H - 2 * PAD * 3) / spanY);
    const offsetX = (ROUTE_W - spanX * scale) / 2;
    const offsetY = (ROUTE_H - spanY * scale) / 2;
    const project = (point: [number, number]): [number, number] | null => {
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
      return [offsetX + (point[1] * kx - minX) * scale, ROUTE_H - (offsetY + (point[0] - minY) * scale)];
    };
    const path = d3Line<[number, number]>()
      .defined((point) => project(point) !== null)
      .x((point) => project(point)![0])
      .y((point) => project(point)![1])(route.points) ?? "";
    const start = project(valid[0]!)!;
    const end = project(valid[valid.length - 1]!)!;
    return { path, start, end, project };
  }, [route]);

  if (!projected) return null;

  let marker: [number, number] | null = null;
  if (route.alignedToTimeline && hoverIndex !== null) {
    marker = projected.project(route.points[hoverIndex] ?? [Number.NaN, Number.NaN]);
  } else if (!route.alignedToTimeline && hoverFraction !== null) {
    marker = projected.project(route.points[Math.round(hoverFraction * (route.points.length - 1))] ?? [Number.NaN, Number.NaN]);
  }

  return (
    <figure className="rounded-[20px] border border-border theme-panel-neutral p-3" data-testid="activity-route">
      <svg viewBox={`0 0 ${ROUTE_W} ${ROUTE_H}`} className="h-auto w-full" role="img" aria-label="Percurso da atividade">
        <path d={projected.path} fill="none" stroke="var(--chart-pace)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={projected.start[0]} cy={projected.start[1]} r={7} fill="var(--chart-route-start)" stroke="var(--background)" strokeWidth={2} />
        <circle cx={projected.end[0]} cy={projected.end[1]} r={7} fill="var(--chart-route-end)" stroke="var(--background)" strokeWidth={2} />
        {marker && <circle cx={marker[0]} cy={marker[1]} r={6} fill="var(--foreground)" stroke="var(--background)" strokeWidth={2} data-testid="activity-route-marker" />}
      </svg>
      <figcaption className="mt-2 flex items-center gap-4 text-xs text-foreground/60">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--chart-route-start)" }} />Início</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--chart-route-end)" }} />Fim</span>
        <span className="ml-auto">Traçado do GPS (sem mapa de fundo)</span>
      </figcaption>
    </figure>
  );
}

function SeriesChart({ series, x, xDomain, hoverIndex }: { series: TimelineSeries; x: number[]; xDomain: [number, number]; hoverIndex: number | null }) {
  const stats = useMemo(() => seriesStats(series), [series]);
  const path = useMemo(() => {
    if (!stats) return "";
    const xScale = scaleLinear().domain(xDomain).range([0, CHART_W]);
    const range: [number, number] = series.inverted ? [PAD, CHART_H - PAD] : [CHART_H - PAD, PAD];
    const yScale = scaleLinear().domain([stats.min, stats.max === stats.min ? stats.min + 1 : stats.max]).range(range);
    const points = series.values.map((value, index) => ({ x: x[index] ?? index, y: value }));
    return d3Line<{ x: number; y: number | null }>()
      .defined((point) => point.y !== null)
      .x((point) => xScale(point.x))
      .y((point) => yScale(point.y!))(points) ?? "";
  }, [series, stats, x, xDomain]);

  if (!stats) return null;
  const hovered = hoverIndex !== null ? series.values[hoverIndex] ?? null : null;
  const guideX = hoverIndex !== null ? scaleLinear().domain(xDomain).range([0, CHART_W])(x[hoverIndex] ?? 0) : null;

  return (
    <div className="rounded-[20px] border border-border theme-panel-neutral p-3" data-testid={`activity-series-${series.key}`}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-foreground" style={{ color: `var(${series.colorVar})` }}>{series.label}</span>
        <span className="tabular-nums text-foreground/80" data-testid="activity-series-value">
          {hovered !== null ? formatSeriesValue(series.format, hovered) : `méd. ${formatSeriesValue(series.format, stats.avg)}`}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-foreground/50">
        <span>mín. {formatSeriesValue(series.format, stats.min)}</span>
        <span>máx. {formatSeriesValue(series.format, stats.max)}</span>
      </div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="mt-1 h-28 w-full" aria-hidden="true">
        <line x1={0} x2={CHART_W} y1={CHART_H / 2} y2={CHART_H / 2} stroke="var(--chart-grid)" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke={`var(${series.colorVar})`} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {guideX !== null && <line x1={guideX} x2={guideX} y1={0} y2={CHART_H} stroke="var(--foreground)" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
}

export function ActivityTimeline({ route, timeline }: { route: ActivityRoute | null; timeline: ActivityTimelineModel | null }) {
  const hasDistanceAxis = Boolean(timeline?.distance?.some((value) => value !== null));
  const [axis, setAxis] = useState<Axis>("time");
  const [hidden, setHidden] = useState<Set<TimelineSeries["key"]>>(() => new Set());
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  const x = useMemo(() => {
    if (!timeline) return [];
    if (axis === "distance" && hasDistanceAxis) {
      let last = 0;
      return timeline.distance!.map((value) => { if (value !== null) last = value; return last; });
    }
    return timeline.time;
  }, [axis, hasDistanceAxis, timeline]);
  const xDomain = useMemo<[number, number]>(() => [x[0] ?? 0, x[x.length - 1] ?? 1], [x]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || x.length === 0) return;
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHoverIndex(nearestIndex(x, xDomain[0] + fraction * (xDomain[1] - xDomain[0])));
  }, [x, xDomain]);

  if (!route && !timeline) return null;
  const hoverFraction = hoverIndex !== null && x.length > 1 ? (x[hoverIndex]! - xDomain[0]) / Math.max(1e-9, xDomain[1] - xDomain[0]) : null;
  const visible = timeline?.series.filter((series) => !hidden.has(series.key)) ?? [];

  return (
    <section className="space-y-4" data-testid="activity-timeline">
      {route && <RouteTrace route={route} hoverIndex={hoverIndex} hoverFraction={hoverFraction} />}
      {timeline && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div role="group" aria-label="Eixo dos gráficos" className="flex gap-1 rounded-full border border-border p-1">
              <button type="button" onClick={() => setAxis("time")} aria-pressed={axis === "time"} className={`rounded-full px-3 py-1 ${axis === "time" ? "theme-pill-success" : "text-foreground/70"}`}>Tempo</button>
              <button type="button" onClick={() => setAxis("distance")} aria-pressed={axis === "distance"} disabled={!hasDistanceAxis} className={`rounded-full px-3 py-1 disabled:opacity-40 ${axis === "distance" ? "theme-pill-success" : "text-foreground/70"}`}>Distância</button>
            </div>
            <div role="group" aria-label="Séries exibidas" className="flex flex-wrap gap-1">
              {timeline.series.map((series) => {
                const on = !hidden.has(series.key);
                return (
                  <button
                    key={series.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setHidden((current) => { const next = new Set(current); if (next.has(series.key)) next.delete(series.key); else next.add(series.key); return next; })}
                    className={`rounded-full border px-3 py-1 ${on ? "theme-pill-neutral" : "border-border text-foreground/45 line-through"}`}
                    style={on ? { borderColor: `var(${series.colorVar})` } : undefined}
                  >
                    {series.label}
                  </button>
                );
              })}
            </div>
            <span className="ml-auto tabular-nums text-foreground/60" data-testid="activity-timeline-cursor">
              {hoverIndex !== null
                ? axis === "distance" ? formatDistance(x[hoverIndex]) : formatDurationClock(x[hoverIndex])
                : timeline.sourceNote}
            </span>
          </div>
          <div
            ref={areaRef}
            className="space-y-3 touch-pan-y"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHoverIndex(null)}
          >
            {visible.map((series) => (
              <SeriesChart key={series.key} series={series} x={x} xDomain={xDomain} hoverIndex={hoverIndex} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
