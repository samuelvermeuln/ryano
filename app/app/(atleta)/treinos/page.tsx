/**
 * /app/treinos — Calendário de treinos do atleta.
 *
 * Cinco visões (?view=day|week|month|year|list), cada uma lendo só o param de
 * data que é seu (ver date-helpers.ts). Mostra TODOS os treinos prescritos
 * pelo professor (de todas as escolas e modalidades) versus o realizado; a
 * visão de lista também traz as atividades reais (Garmin/Strava/etc) do
 * período, lado a lado com as prescrições — sem fundir os dois registros.
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { buildNoIndexMetadata } from "@/server/seo";

import {
  addDaysUTC,
  addMonthsUTC,
  addYearsUTC,
  fmtMonthYear,
  fmtShort,
  getAnchorDate,
  getDayRange,
  getMonthRange,
  getWeekRange,
  getYearRange,
  monthParam,
  parseViewParam,
  toISODate,
  todayUTC,
  type TreinosSearchParams,
} from "./date-helpers";
import {
  getActivitiesInRange,
  getAssignmentSummariesInRange,
  getAssignmentsInRange,
} from "./queries";
import { ViewSwitcher } from "./view-switcher";
import { CalendarNav } from "./calendar-nav";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";
import { MonthView } from "./month-view";
import { YearView } from "./year-view";
import { ListView } from "./list-view";

export const metadata = buildNoIndexMetadata({
  title: "Treinos — Ryvano",
  description: "Calendário de treinos prescritos e realizados.",
  path: "/app/treinos",
});

export const dynamic = "force-dynamic";

export default async function TreinosPage({
  searchParams,
}: {
  searchParams: Promise<TreinosSearchParams>;
}) {
  if (!isSchoolModuleEnabled()) redirect("/app/dashboard");

  const session = await requireOnboardedSession();
  const params = await searchParams;

  const view = parseViewParam(params.view);
  const anchor = getAnchorDate(view, params);
  const todayISO = toISODate(todayUTC());

  let title = "Treinos";
  let content: React.ReactNode;
  let nav: React.ReactNode = null;

  if (view === "day") {
    const range = getDayRange(anchor);
    const assignments = await getAssignmentsInRange(session.user.id, range);
    const isoDate = toISODate(anchor);
    title = fmtShort(anchor);
    nav = (
      <CalendarNav
        prevHref={`?view=day&date=${toISODate(addDaysUTC(anchor, -1))}`}
        nextHref={`?view=day&date=${toISODate(addDaysUTC(anchor, 1))}`}
        todayHref="?view=day"
        isCurrent={isoDate === todayISO}
      />
    );
    content = <DayView day={anchor} assignments={assignments} />;
  } else if (view === "month") {
    const range = getMonthRange(anchor);
    const assignments = await getAssignmentSummariesInRange(session.user.id, range);
    title = fmtMonthYear(anchor);
    nav = (
      <CalendarNav
        prevHref={`?view=month&month=${monthParam(addMonthsUTC(anchor, -1))}`}
        nextHref={`?view=month&month=${monthParam(addMonthsUTC(anchor, 1))}`}
        todayHref="?view=month"
        isCurrent={monthParam(anchor) === monthParam(todayUTC())}
      />
    );
    content = <MonthView monthStart={anchor} assignments={assignments} />;
  } else if (view === "year") {
    const range = getYearRange(anchor);
    const assignments = await getAssignmentSummariesInRange(session.user.id, range);
    title = String(anchor.getUTCFullYear());
    nav = (
      <CalendarNav
        prevHref={`?view=year&year=${addYearsUTC(anchor, -1).getUTCFullYear()}`}
        nextHref={`?view=year&year=${addYearsUTC(anchor, 1).getUTCFullYear()}`}
        todayHref="?view=year"
        isCurrent={anchor.getUTCFullYear() === todayUTC().getUTCFullYear()}
      />
    );
    content = <YearView yearStart={anchor} assignments={assignments} />;
  } else if (view === "list") {
    const range = getMonthRange(anchor);
    const [assignments, activities] = await Promise.all([
      getAssignmentsInRange(session.user.id, range),
      getActivitiesInRange(session.user.id, range),
    ]);
    title = `Lista — ${fmtMonthYear(anchor)}`;
    nav = (
      <CalendarNav
        prevHref={`?view=list&month=${monthParam(addMonthsUTC(anchor, -1))}`}
        nextHref={`?view=list&month=${monthParam(addMonthsUTC(anchor, 1))}`}
        todayHref="?view=list"
        isCurrent={monthParam(anchor) === monthParam(todayUTC())}
      />
    );
    content = <ListView assignments={assignments} activities={activities} />;
  } else {
    // week (default)
    const range = getWeekRange(anchor);
    const assignments = await getAssignmentsInRange(session.user.id, range);
    const sunday = addDaysUTC(anchor, 6);
    title = `${fmtShort(anchor)} – ${fmtShort(sunday)}`;
    const isCurrentWeek = toISODate(anchor) <= todayISO && todayISO <= toISODate(sunday);
    nav = (
      <CalendarNav
        prevHref={`?view=week&week=${toISODate(addDaysUTC(anchor, -7))}`}
        nextHref={`?view=week&week=${toISODate(addDaysUTC(anchor, 7))}`}
        todayHref="?view=week"
        isCurrent={isCurrentWeek}
      />
    );
    content = <WeekView monday={anchor} assignments={assignments} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Treinos</h1>
          <p className="text-sm text-foreground/50 mt-0.5">{title}</p>
        </div>
        {nav}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href="/app/treinos/solicitar"
          className="text-xs rounded-lg border border-white/12 px-3 py-1.5 font-medium hover:bg-white/6 transition-colors"
        >
          Solicitar treino
        </Link>
        <Link
          href="/app/treinos/nova-atividade"
          className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-medium hover:opacity-90 transition-opacity"
        >
          + Adicionar atividade
        </Link>
      </div>

      <ViewSwitcher view={view} anchor={anchor} />

      {content}
    </div>
  );
}
