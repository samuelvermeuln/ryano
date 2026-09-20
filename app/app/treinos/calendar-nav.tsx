import Link from "next/link";

/** Generic ←/Hoje/→ navigation — every view computes its own hrefs (a day,
 *  a week, a month or a year step) and hands them to this dumb component. */
export function CalendarNav({
  prevHref,
  nextHref,
  todayHref,
  isCurrent,
}: {
  prevHref: string;
  nextHref: string;
  todayHref: string;
  isCurrent: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Link
        href={prevHref}
        className="rounded-xl border border-white/12 px-3 py-2 text-sm hover:bg-white/6 transition-colors"
        title="Anterior"
      >
        ←
      </Link>
      {!isCurrent && (
        <Link
          href={todayHref}
          className="rounded-xl border border-white/12 px-3 py-2 text-xs font-medium hover:bg-white/6 transition-colors"
        >
          Hoje
        </Link>
      )}
      <Link
        href={nextHref}
        className="rounded-xl border border-white/12 px-3 py-2 text-sm hover:bg-white/6 transition-colors"
        title="Próximo"
      >
        →
      </Link>
    </div>
  );
}
