import type { ZoneSetModel } from "@/modules/shared/activities/presentation/activity-detail-model";

const ZONE_COLORS = ["bg-sky-400/70", "bg-emerald-400/70", "bg-amber-400/70", "bg-orange-400/70", "bg-rose-400/70"];

/**
 * SAM-40 — time in zones (heart rate, and power/pace when the provider has
 * them). One card per zone set, each labelled with its source: native zones
 * of the provider, or zones the core estimated from the heart-rate stream.
 * Server Component.
 */
export function ActivityZones({ zones }: { zones: ZoneSetModel[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {zones.map((set) => (
        <section key={set.id} className="rounded-[20px] border border-border theme-panel-neutral p-5" data-testid={`activity-zones-${set.id}`}>
          <h3 className="text-base font-semibold text-foreground">{set.title}</h3>
          <p className="mt-1 text-xs text-foreground/60">{set.sourceNote}</p>
          <ul className="mt-4 space-y-3">
            {set.items.map((item, index) => (
              <li key={item.label} data-testid="activity-zone">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground/85">{item.label}</span>
                  <span className="tabular-nums text-foreground/70">{item.valueText} · {item.shareText}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
                  <div
                    className={`h-full rounded-full ${ZONE_COLORS[index % ZONE_COLORS.length]}`}
                    style={{ width: `${Math.max(2, Math.round(item.ratio * 100))}%` }}
                    aria-hidden="true"
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
