/**
 * SAM-67 — the coach's counters (§19.2): each one with its definition, the
 * period it covers and a link to the filtered list. Same component in the
 * independent hub and inside a school.
 */
import Link from "next/link";

import { SectionCard } from "@/components/section-card";

const PERIODS = [7, 30, 90] as const;

export function CoachOverviewCounters({
  counters, days, basePath,
}: {
  counters: Array<{ list: string; label: string; definition: string; count: number }>;
  days: number;
  /** The "Acompanhamento" page of this context (hub or school). */
  basePath: string;
}) {
  return (
    <SectionCard
      title="Acompanhamento"
      description={`Últimos ${days} dias. Cada número abre a lista correspondente.`}
      action={
        <span className="flex gap-1.5 text-xs">
          {PERIODS.map((period) => (
            <Link key={period} href={`${basePath}?dias=${period}`} className={`rounded-full border px-2.5 py-1 ${period === days ? "border-primary/30 bg-primary/15 text-primary" : "border-white/12 text-foreground/60"}`}>
              {period} dias
            </Link>
          ))}
        </span>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="coach-overview-counters">
        {counters.map((counter) => (
          <li key={counter.list}>
            <Link href={`${basePath}?lista=${counter.list}&dias=${days}`} className="block rounded-[18px] border border-white/10 bg-white/5 p-3 hover:bg-white/10" data-testid={`counter-${counter.list}`} data-count={counter.count} aria-label={`${counter.label}: ${counter.count}`}>
              <span className="text-xs uppercase tracking-wide text-foreground/55">{counter.label}</span>
              <span className="mt-1 block text-2xl font-semibold tabular-nums">{counter.count}</span>
              <span className="mt-1 block text-[11px] text-foreground/50">{counter.definition}</span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
