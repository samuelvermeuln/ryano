/**
 * SAM-57 — event and unavailability items on the athlete's calendar, and the
 * legend: every kind has an icon AND a color, never color alone (§19.1).
 */
import Link from "next/link";
import { IconBan, IconCalendarEvent, IconCircleCheck, IconCircleDot, IconRun } from "@tabler/icons-react";

import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import type { CalendarEvent, CalendarUnavailability } from "./calendar-extras";

export const EVENT_ACCENT = { ring: "border-rose-400/25 bg-rose-400/8", dot: "bg-rose-400", text: "text-rose-300" };
export const UNAVAILABLE_ACCENT = { ring: "border-slate-400/25 bg-slate-400/8", dot: "bg-slate-400", text: "text-slate-300" };

function formatLocal(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export function EventCard({ event }: { event: CalendarEvent }) {
  return (
    <Link
      href={`/app/eventos/${event.participationId}`}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors hover:bg-white/6 ${EVENT_ACCENT.ring}`}
      data-testid="calendar-event"
    >
      <IconCalendarEvent size={18} className={EVENT_ACCENT.text} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{event.name}</span>
        <span className="block text-xs text-foreground/55">
          Evento · {resolveSportLabel(event.sportType) ?? event.sportType}
          {event.optionLabel ? ` · ${event.optionLabel}` : ""}
          {event.status === "POSTPONED" ? " · adiado" : ""}
        </span>
      </span>
    </Link>
  );
}

export function UnavailabilityCard({ period }: { period: CalendarUnavailability }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${UNAVAILABLE_ACCENT.ring}`} data-testid="calendar-unavailability">
      <IconBan size={18} className={UNAVAILABLE_ACCENT.text} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate font-medium">Indisponível: {period.reason}</span>
        <span className="block text-xs text-foreground/55">{formatLocal(period.startLocalDate)} a {formatLocal(period.endLocalDate)}</span>
      </span>
    </div>
  );
}

const LEGEND = [
  { label: "Treino prescrito", icon: IconCircleDot, className: "text-primary" },
  { label: "Realizado", icon: IconCircleCheck, className: "text-emerald-400" },
  { label: "Não planejada", icon: IconRun, className: "text-indigo-300" },
  { label: "Evento", icon: IconCalendarEvent, className: EVENT_ACCENT.text },
  { label: "Indisponível", icon: IconBan, className: UNAVAILABLE_ACCENT.text },
] as const;

export function CalendarLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/60" aria-label="Legenda do calendário" data-testid="calendar-legend">
      {LEGEND.map(({ label, icon: Icon, className }) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <Icon size={14} className={className} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}
