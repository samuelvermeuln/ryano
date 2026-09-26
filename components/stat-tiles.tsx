import type { ReactNode } from "react";

export type StatTile = {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

const toneClassMap = {
  neutral: "text-foreground",
  success: "text-emerald-400",
  warning: "text-amber-400",
  danger: "text-rose-400",
} as const;

/**
 * Header KPI row shared by the school management screens.
 *
 * Every screen was previously a bare table, so the same "how many, and how
 * many need me right now" summary was being re-implemented ad hoc. Values are
 * rendered as given — formatting (currency, percentages) belongs to the
 * caller, which is the only place that knows the unit.
 */
export function StatTiles({ items }: { items: StatTile[] }) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="glass rounded-[20px] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-foreground/50">{item.label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClassMap[item.tone ?? "neutral"]}`}>
            {item.value}
          </p>
          {item.hint ? <p className="mt-0.5 text-xs text-foreground/45">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
