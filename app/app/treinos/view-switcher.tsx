import Link from "next/link";

import { getISOMonday, monthParam, toISODate, type ViewMode } from "./date-helpers";

const VIEW_LABELS: Record<ViewMode, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mês",
  year: "Ano",
  list: "Lista",
};

const VIEW_ORDER: ViewMode[] = ["day", "week", "month", "year", "list"];

export function buildViewHref(target: ViewMode, anchor: Date): string {
  switch (target) {
    case "day": return `?view=day&date=${toISODate(anchor)}`;
    case "week": return `?view=week&week=${toISODate(getISOMonday(anchor))}`;
    case "month": return `?view=month&month=${monthParam(anchor)}`;
    case "year": return `?view=year&year=${anchor.getUTCFullYear()}`;
    case "list": return `?view=list&month=${monthParam(anchor)}`;
  }
}

/** Pure server-rendered pill switcher — every target link is derived from the
 *  single `anchor` date already resolved for the current view, so switching
 *  views keeps you looking at (roughly) the same point in time. */
export function ViewSwitcher({ view, anchor }: { view: ViewMode; anchor: Date }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Visão do calendário">
      {VIEW_ORDER.map((target) => {
        const active = target === view;
        return (
          <Link
            key={target}
            href={buildViewHref(target, anchor)}
            role="tab"
            aria-selected={active}
            className={[
              "rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
              active
                ? "border-primary/30 bg-primary/15 text-primary"
                : "border-white/12 text-foreground/60 hover:bg-white/6",
            ].join(" ")}
          >
            {VIEW_LABELS[target]}
          </Link>
        );
      })}
    </div>
  );
}
