"use client";

import { arc as d3Arc, pie as d3Pie } from "d3-shape";
import { useState, useSyncExternalStore } from "react";

import { formatDuration } from "@/lib/format";
import type { ZoneItem, ZoneSetModel } from "@/modules/shared/activities/presentation/activity-detail-model";

/**
 * SAM-40 — time in zones as a chart the reader chooses: horizontal bars (the
 * original view), donut, columns or one stacked bar. Every view uses the same
 * zone colours (`--zone-1..5` in globals.css, light and dark), so Z3 is the
 * same colour in the bars, the donut slice and the legend. The choice is a
 * per-viewer convenience kept in localStorage (never required).
 */
export const ZONE_CHART_VIEWS = [
  { id: "barras", label: "Barras" },
  { id: "pizza", label: "Pizza" },
  { id: "colunas", label: "Colunas" },
  { id: "empilhada", label: "Empilhada" },
] as const;

export type ZoneChartView = (typeof ZONE_CHART_VIEWS)[number]["id"];

const STORAGE_KEY = "ryvano-zone-chart-view";

export function zoneColor(index: number): string {
  return `var(--zone-${(index % 5) + 1})`;
}

function readStoredView(): ZoneChartView | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return ZONE_CHART_VIEWS.some((view) => view.id === value) ? (value as ZoneChartView) : null;
  } catch {
    return null;
  }
}

function storeView(view: ZoneChartView) {
  try {
    window.localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Private window or blocked storage: the choice just is not remembered.
  }
}

function BarsView({ items }: { items: ZoneItem[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={item.label} data-testid="activity-zone">
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 text-foreground/85">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: zoneColor(index) }} aria-hidden="true" />
              {item.label}
            </span>
            <span className="tabular-nums text-foreground/70">{item.valueText} · {item.shareText}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.round(item.ratio * 100))}%`, background: zoneColor(index) }} aria-hidden="true" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Legend({ items }: { items: ZoneItem[] }) {
  return (
    <ul className="grid gap-1.5 text-sm sm:grid-cols-2" data-testid="activity-zone-legend">
      {items.map((item, index) => (
        <li key={item.label} className="flex items-center justify-between gap-2" data-testid="activity-zone">
          <span className="inline-flex items-center gap-2 text-foreground/85">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: zoneColor(index) }} aria-hidden="true" />
            {item.label}
          </span>
          <span className="tabular-nums text-foreground/65">{item.valueText} · {item.shareText}</span>
        </li>
      ))}
    </ul>
  );
}

function DonutView({ items }: { items: ZoneItem[] }) {
  const total = items.reduce((sum, item) => sum + item.seconds, 0);
  const slices = d3Pie<ZoneItem>().value((item) => item.seconds).sort(null)(items);
  const arc = d3Arc<(typeof slices)[number]>().innerRadius(52).outerRadius(88).padAngle(0.012).cornerRadius(3);
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="-100 -100 200 200" className="h-52 w-52" role="img" aria-label={`Tempo em zonas, total ${formatDuration(total)}`}>
        {slices.map((slice, index) => (
          <path key={items[index]!.label} d={arc(slice) ?? ""} fill={zoneColor(index)} data-testid="activity-zone-slice">
            <title>{`${items[index]!.label}: ${items[index]!.valueText} (${items[index]!.shareText})`}</title>
          </path>
        ))}
        <text textAnchor="middle" y={-2} fontSize={18} fontWeight={600} fill="currentColor">{formatDuration(total)}</text>
        <text textAnchor="middle" y={16} fontSize={10} fill="currentColor" opacity={0.6}>total</text>
      </svg>
      <Legend items={items} />
    </div>
  );
}

function ColumnsView({ items }: { items: ZoneItem[] }) {
  const max = Math.max(1, ...items.map((item) => item.seconds));
  const width = 300;
  const height = 160;
  const gap = 12;
  const columnWidth = (width - gap * (items.length - 1)) / Math.max(1, items.length);
  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${width} ${height + 22}`} className="h-52 w-full" role="img" aria-label="Tempo em cada zona">
        {items.map((item, index) => {
          const h = Math.max(2, (item.seconds / max) * height);
          const x = index * (columnWidth + gap);
          return (
            <g key={item.label}>
              <rect x={x} y={height - h} width={columnWidth} height={h} rx={6} fill={zoneColor(index)} data-testid="activity-zone-column">
                <title>{`${item.label}: ${item.valueText} (${item.shareText})`}</title>
              </rect>
              <text x={x + columnWidth / 2} y={height + 16} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.7}>{item.shareText}</text>
            </g>
          );
        })}
      </svg>
      <Legend items={items} />
    </div>
  );
}

function StackedView({ items }: { items: ZoneItem[] }) {
  const total = items.reduce((sum, item) => sum + item.seconds, 0);
  return (
    <div className="space-y-3">
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-border" role="img" aria-label="Distribuição do tempo entre as zonas">
        {items.map((item, index) => (
          <div
            key={item.label}
            title={`${item.label}: ${item.valueText} (${item.shareText})`}
            style={{ width: `${total > 0 ? (item.seconds / total) * 100 : 0}%`, background: zoneColor(index) }}
            data-testid="activity-zone-segment"
          />
        ))}
      </div>
      <Legend items={items} />
    </div>
  );
}

/** No cross-tab sync needed: the stored choice is read once per mount, after hydration. */
function subscribeToStoredView(): () => void {
  return () => {};
}

export function ActivityZoneChart({ set }: { set: ZoneSetModel }) {
  // Server render and first client render agree on "no stored choice" (null),
  // then the client reads localStorage — no hydration mismatch, no effect.
  const stored = useSyncExternalStore(subscribeToStoredView, readStoredView, () => null);
  const [chosen, setChosen] = useState<ZoneChartView | null>(null);
  const view: ZoneChartView = chosen ?? stored ?? "barras";

  function choose(next: ZoneChartView) {
    setChosen(next);
    storeView(next);
  }

  return (
    <section data-testid={`activity-zones-${set.id}`} data-view={view}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">{set.title}</h3>
          <p className="mt-1 text-xs text-foreground/60">{set.sourceNote}</p>
        </div>
        <div role="group" aria-label="Tipo de gráfico das zonas" className="flex flex-wrap gap-1 rounded-full border border-border p-1 text-xs">
          {ZONE_CHART_VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => choose(option.id)}
              className={`rounded-full px-3 py-1 ${view === option.id ? "theme-pill-success font-medium" : "text-foreground/70"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        {view === "barras" && <BarsView items={set.items} />}
        {view === "pizza" && <DonutView items={set.items} />}
        {view === "colunas" && <ColumnsView items={set.items} />}
        {view === "empilhada" && <StackedView items={set.items} />}
      </div>
    </section>
  );
}
