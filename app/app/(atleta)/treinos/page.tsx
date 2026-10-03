/**
 * /app/treinos — Calendário de treinos do atleta.
 *
 * Cinco visões (?view=day|week|month|year|list), cada uma lendo só o param de
 * data que é seu (ver date-helpers.ts). Mostra TODOS os treinos prescritos
 * pelo professor (de todas as escolas e modalidades) versus o realizado; dia,
 * semana, mês e lista também trazem as atividades reais (Garmin/Strava/etc)
 * que nenhuma prescrição casou, como "Não planejada" (SAM-41) — sem fundir os
 * dois registros e sem mostrar a mesma sessão duas vezes.
 *
 * SAM-57 — eventos do atleta e períodos de indisponibilidade entram no
 * calendário (ícone + cor, com legenda), o filtro `?modalidade=` vale em todas
 * as visões e "Adicionar evento"/"Indisponibilidade" abrem modais centralizados.
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
  getMatchedExecutionLinksInRange,
} from "./queries";
import { unmatchedActivities } from "./timeline";
import { ViewSwitcher } from "./view-switcher";
import { CalendarNav } from "./calendar-nav";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";
import { MonthView } from "./month-view";
import { YearView } from "./year-view";
import { ListView } from "./list-view";
import { getCalendarExtras, parseSportParam } from "./calendar-extras";
import { CalendarLegend } from "./calendar-extra-cards";
import { SportFilter } from "./sport-filter";
import { NewEventDialog } from "@/components/events/new-event-dialog";
import { UnavailabilityDialog } from "@/components/events/unavailability-dialog";
import { sportOptions } from "@/components/events/sport-options";

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
  const sports = sportOptions();
  const sport = parseSportParam(params.modalidade, sports.map((option) => option.value));
  // Kept on every navigation link so the filter survives prev/next and view changes.
  const keep = sport ? `&modalidade=${encodeURIComponent(sport)}` : "";

  let title = "Treinos";
  let content: React.ReactNode;
  let nav: React.ReactNode = null;

  if (view === "day") {
    const range = getDayRange(anchor);
    const [assignments, activities, extras] = await Promise.all([
      getAssignmentsInRange(session.user.id, range, sport),
      getActivitiesInRange(session.user.id, range, sport),
      getCalendarExtras(session.user.id, range, sport),
    ]);
    const isoDate = toISODate(anchor);
    title = fmtShort(anchor);
    nav = (
      <CalendarNav
        prevHref={`?view=day&date=${toISODate(addDaysUTC(anchor, -1))}${keep}`}
        nextHref={`?view=day&date=${toISODate(addDaysUTC(anchor, 1))}${keep}`}
        todayHref={`?view=day${keep}`}
        isCurrent={isoDate === todayISO}
      />
    );
    content = <DayView day={anchor} assignments={assignments} activities={activities} extras={extras} />;
  } else if (view === "month") {
    const range = getMonthRange(anchor);
    const [assignments, activities, links, extras] = await Promise.all([
      getAssignmentSummariesInRange(session.user.id, range, sport),
      getActivitiesInRange(session.user.id, range, sport),
      getMatchedExecutionLinksInRange(session.user.id, range),
      getCalendarExtras(session.user.id, range, sport),
    ]);
    title = fmtMonthYear(anchor);
    nav = (
      <CalendarNav
        prevHref={`?view=month&month=${monthParam(addMonthsUTC(anchor, -1))}${keep}`}
        nextHref={`?view=month&month=${monthParam(addMonthsUTC(anchor, 1))}${keep}`}
        todayHref={`?view=month${keep}`}
        isCurrent={monthParam(anchor) === monthParam(todayUTC())}
      />
    );
    content = <MonthView monthStart={anchor} assignments={assignments} unplannedActivities={unmatchedActivities(links, activities)} extras={extras} />;
  } else if (view === "year") {
    const range = getYearRange(anchor);
    const assignments = await getAssignmentSummariesInRange(session.user.id, range, sport);
    title = String(anchor.getUTCFullYear());
    nav = (
      <CalendarNav
        prevHref={`?view=year&year=${addYearsUTC(anchor, -1).getUTCFullYear()}${keep}`}
        nextHref={`?view=year&year=${addYearsUTC(anchor, 1).getUTCFullYear()}${keep}`}
        todayHref={`?view=year${keep}`}
        isCurrent={anchor.getUTCFullYear() === todayUTC().getUTCFullYear()}
      />
    );
    content = <YearView yearStart={anchor} assignments={assignments} />;
  } else if (view === "list") {
    const range = getMonthRange(anchor);
    const [assignments, activities, extras] = await Promise.all([
      getAssignmentsInRange(session.user.id, range, sport),
      getActivitiesInRange(session.user.id, range, sport),
      getCalendarExtras(session.user.id, range, sport),
    ]);
    title = `Lista — ${fmtMonthYear(anchor)}`;
    nav = (
      <CalendarNav
        prevHref={`?view=list&month=${monthParam(addMonthsUTC(anchor, -1))}${keep}`}
        nextHref={`?view=list&month=${monthParam(addMonthsUTC(anchor, 1))}${keep}`}
        todayHref={`?view=list${keep}`}
        isCurrent={monthParam(anchor) === monthParam(todayUTC())}
      />
    );
    content = <ListView assignments={assignments} activities={activities} extras={extras} />;
  } else {
    // week (default)
    const range = getWeekRange(anchor);
    const [assignments, activities, extras] = await Promise.all([
      getAssignmentsInRange(session.user.id, range, sport),
      getActivitiesInRange(session.user.id, range, sport),
      getCalendarExtras(session.user.id, range, sport),
    ]);
    const sunday = addDaysUTC(anchor, 6);
    title = `${fmtShort(anchor)} – ${fmtShort(sunday)}`;
    const isCurrentWeek = toISODate(anchor) <= todayISO && todayISO <= toISODate(sunday);
    nav = (
      <CalendarNav
        prevHref={`?view=week&week=${toISODate(addDaysUTC(anchor, -7))}${keep}`}
        nextHref={`?view=week&week=${toISODate(addDaysUTC(anchor, 7))}${keep}`}
        todayHref={`?view=week${keep}`}
        isCurrent={isCurrentWeek}
      />
    );
    content = <WeekView monday={anchor} assignments={assignments} activities={activities} extras={extras} />;
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
        <NewEventDialog sports={sports} label="Adicionar evento" />
        <UnavailabilityDialog />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewSwitcher view={view} anchor={anchor} keep={keep} />
        <SportFilter options={sports} value={sport} />
      </div>
      <CalendarLegend />

      {content}
    </div>
  );
}
