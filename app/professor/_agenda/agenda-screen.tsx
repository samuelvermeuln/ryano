/**
 * SAM-16 — Agenda semanal do professor.
 *
 * One week of every athlete this coach may read, positioned by the agenda's
 * wall clock: seven day columns over hour bands on desktop, one day at a time
 * on mobile. Athletes prescribed at the same time collapse into one chip
 * (`buildWeeklyAgenda`), expanded in a centered modal.
 *
 * SAM-36 — the same screen serves the school agenda and the independent
 * calendar (`scope`), shows planned AND done (prescriptions with their
 * prescribed × executed outcome, unplanned imports, self-logged sessions),
 * the period's totals, a type filter and a month view (`visao=mes`).
 *
 * Every parameter lives in the URL (`semana`/`mes`, `visao`, `turma`,
 * `modalidade`, `atleta`, `sem-professor`, `tipo`, `dia`), so a filtered
 * period is shareable and navigation keeps the filters. Authorization is the
 * use case's: the page only formats.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { formatDistance, formatDuration } from "@/lib/format";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { resolveAthleteTimeZone } from "@/modules/school/application/athlete-time-zone";
import { GetCoachWeeklyAgenda } from "@/modules/school/application/get-coach-weekly-agenda";
import { SchoolError } from "@/modules/school/domain/errors";
import {
  addCalendarDays,
  formatIsoWeek,
  isValidLocalDate,
  mondayOfIsoWeek,
  mondayOnOrBefore,
  todayLocalDate,
  type LocalDate,
} from "@/modules/school/domain/local-date";
import {
  buildWeeklyAgenda,
  describeAgendaSlot,
  summarizeAgendaItems,
  type AgendaItem,
  type AgendaSlot,
} from "@/modules/school/presentation/weekly-agenda";
import { ASSIGNMENT_STATUS_LABELS, PRESCRIPTION_OUTCOME_LABELS } from "@/modules/school/presentation/workout-labels";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { loadAthleteCalendarOverlay } from "@/modules/school/application/athlete-calendar-overlay";
import { AssignFromCatalogDialog } from "@/components/workouts/assign-from-catalog-dialog";
import { hubBasePath, type CoachAthleteScope } from "@/app/professor/_athlete-hub/hub-scope";
import { agendaHref, type AgendaQuery } from "./agenda-paths";
import { AgendaSlotChip, type AgendaEntryView, type AgendaSlotView } from "./agenda-slot";

const agenda = new GetCoachWeeklyAgenda(prisma);

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  COMPLETED: "success",
  PARTIALLY_COMPLETED: "success",
  MISSED: "danger",
  RESCHEDULED: "warning",
};

const OUTCOME_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  EXECUTED_AS_PLANNED: "success",
  EXECUTED_PARTIALLY: "warning",
  EXECUTED_DIFFERENTLY: "warning",
  PLANNED_NOT_EXECUTED: "neutral",
  UNPLANNED_ACTIVITY: "neutral",
};

const TYPE_FILTERS = [
  { value: "", label: "Tudo" },
  { value: "prescricao", label: "Só prescrições", kinds: ["prescription"] as const },
  { value: "nao-planejada", label: "Só não planejadas", kinds: ["unplanned-import", "unplanned-self"] as const },
] as const;

const WEEKDAY_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function localDateAsUtc(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** "6 out" — the date is a local calendar date, so it is formatted as a UTC instant on purpose. */
function dayNumberLabel(date: LocalDate): string {
  return localDateAsUtc(date).toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
}

function dayLongLabel(date: LocalDate, weekdayIndex: number): string {
  return `${WEEKDAY_LABELS[weekdayIndex]}., ${dayNumberLabel(date)}`;
}

function weekRangeLabel(weekStart: LocalDate): string {
  const end = addCalendarDays(weekStart, 6);
  const year = localDateAsUtc(end).getUTCFullYear();
  return `${dayNumberLabel(weekStart)} – ${dayNumberLabel(end)} ${year}`;
}

function monthLabel(month: string): string {
  return localDateAsUtc(`${month}-01` as LocalDate).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, m! - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mondays covering the month: from the Monday on/before the 1st to the one after the last day. */
function monthWeeks(month: string): { weekStart: LocalDate; weeks: number } {
  const first = `${month}-01` as LocalDate;
  const weekStart = mondayOnOrBefore(first);
  const nextMonthFirst = `${shiftMonth(month, 1)}-01` as LocalDate;
  let weeks = 1;
  while (addCalendarDays(weekStart, 7 * weeks) < nextMonthFirst) weeks += 1;
  return { weekStart, weeks: Math.min(6, weeks) };
}

function volumeLabel(item: Pick<AgendaItem, "durationSeconds" | "distanceMeters">): string | null {
  const parts = [
    item.durationSeconds != null ? formatDuration(item.durationSeconds) : null,
    item.distanceMeters != null && item.distanceMeters > 0 ? formatDistance(item.distanceMeters) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export async function AgendaScreen({ scope, query }: { scope: CoachAthleteScope; query: AgendaQuery }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const schoolId = scope.kind === "school" ? scope.schoolId : "";

  // The agenda's zone decides which Monday "this week" is; it is read once
  // here so an invalid `semana` can fall back to the current week.
  const timeZone = scope.kind === "school"
    ? (await prisma.school.findUnique({ where: { id: scope.schoolId }, select: { timezone: true } }))?.timezone
    : await resolveAthleteTimeZone(prisma, session.user.id);
  if (!timeZone) notFound();
  const today = todayLocalDate(new Date(), timeZone);
  const monthView = query.visao === "mes";
  const month = query.mes && MONTH_RE.test(query.mes) ? query.mes : today.slice(0, 7);
  const span = monthView ? monthWeeks(month) : { weekStart: (query.semana && mondayOfIsoWeek(query.semana)) || mondayOnOrBefore(today), weeks: 1 };
  const weekStart = span.weekStart;
  const normalizedQuery: AgendaQuery = monthView
    ? { ...query, visao: "mes", mes: month, semana: undefined }
    : { ...query, semana: formatIsoWeek(weekStart), mes: undefined, visao: undefined };
  const typeFilter = TYPE_FILTERS.find((option) => option.value === (query.tipo ?? "")) ?? TYPE_FILTERS[0];

  let data: Awaited<ReturnType<typeof agenda.execute>>;
  try {
    data = await agenda.execute(session.user.id, scope, {
      weekStart,
      weeks: span.weeks,
      ...(query.turma ? { teamId: query.turma } : {}),
      ...(query.modalidade ? { sportType: query.modalidade } : {}),
      ...(query.atleta ? { athleteId: query.atleta } : {}),
      ...(query["sem-professor"] === "1" ? { withoutCoach: true } : {}),
      ...("kinds" in typeFilter ? { kinds: [...typeFilter.kinds] } : {}),
    });
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const weeks = Array.from({ length: span.weeks }, (_, index) =>
    buildWeeklyAgenda(data.items, addCalendarDays(weekStart, 7 * index), data.timeZone));
  const week = weeks[0]!;
  const weekDates = week.days.map((day) => day.date);
  const selectedDay = query.dia && isValidLocalDate(query.dia) && weekDates.includes(query.dia)
    ? query.dia
    : weekDates.includes(today) ? today : weekStart;
  const totals = summarizeAgendaItems(data.items);
  const overlay = query.atleta
    ? await loadAthleteCalendarOverlay(prisma, session.user.id, query.atleta, { from: weekStart, to: addCalendarDays(weekStart, 7 * span.weeks - 1) }).catch(() => null)
    : null;
  const base = (athleteId: string) => hubBasePath(scope, athleteId);

  const toView = (slot: AgendaSlot, dates: LocalDate[]): AgendaSlotView => {
    const described = describeAgendaSlot(slot, resolveSportLabel);
    return {
      key: slot.key,
      time: slot.time,
      dayLabel: dayLongLabel(slot.date, dates.indexOf(slot.date)),
      who: described.who,
      detail: described.detail,
      unplannedOnly: slot.entries.every((entry) => entry.kind !== "prescription"),
      entries: slot.entries.map((entry): AgendaEntryView => ({
        id: entry.kind === "unplanned-import" ? entry.activityId! : entry.assignmentId!,
        kind: entry.kind,
        assignmentId: entry.assignmentId,
        athleteId: entry.athlete.id,
        athleteName: entry.athlete.name,
        title: entry.title,
        sportLabel: entry.sportType ? resolveSportLabel(entry.sportType) ?? entry.sportType : null,
        team: entry.team?.name ?? null,
        coach: entry.coach?.name ?? null,
        statusLabel: ASSIGNMENT_STATUS_LABELS[entry.status] ?? entry.status,
        statusTone: STATUS_TONE[entry.status] ?? "neutral",
        outcomeLabel: entry.outcome ? PRESCRIPTION_OUTCOME_LABELS[entry.outcome] ?? entry.outcome : null,
        outcomeTone: entry.outcome ? OUTCOME_TONE[entry.outcome] ?? "neutral" : "neutral",
        volumeLabel: volumeLabel(entry),
        localDateTime: `${entry.localDate}T${entry.localTime}`,
        href: entry.kind === "prescription"
          ? `${base(entry.athlete.id)}/treinos/${entry.assignmentId}`
          : entry.activityId
            ? `${base(entry.athlete.id)}/atividades/${entry.activityId}`
            : `${base(entry.athlete.id)}/atividades?origem=nao-planejadas`,
        canReschedule: entry.canReschedule,
      })),
    };
  };

  const hasFilters = Boolean(query.turma || query.modalidade || query.atleta || query["sem-professor"] || query.tipo);
  const previousWeek = addCalendarDays(weekStart, -7);
  const nextWeek = addCalendarDays(weekStart, 7);
  const periodLabel = monthView ? monthLabel(month) : `${weekRangeLabel(weekStart)} · ${formatIsoWeek(weekStart)}`;
  const summaryText = data.items.length === 0
    ? "Nada neste período."
    : [
      `${totals.prescriptions} prescrição(ões)`,
      totals.prescriptions > 0 ? `${totals.executed} executada(s)` : null,
      totals.notExecuted > 0 ? `${totals.notExecuted} não executada(s)` : null,
      `${totals.unplanned} não planejada(s)`,
      `${totals.athletes} atleta(s)`,
      totals.durationSeconds > 0 ? formatDuration(totals.durationSeconds) : null,
      totals.distanceMeters > 0 ? formatDistance(totals.distanceMeters) : null,
    ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6 p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{scope.kind === "school" ? "Agenda" : "Calendário"}</h1>
          <p className="mt-1 text-sm text-foreground/60">
            {scope.kind === "school"
              ? `${data.seesWholeSchool ? "Todos os atletas da escola" : "Seus atletas"} — prescrito e executado, no horário da escola`
              : "Seus atletas independentes — prescrito e executado, no seu horário"}
            {" "}({data.timeZone.replace(/_/g, " ")}).
          </p>
        </div>
        <nav aria-label={monthView ? "Navegar entre meses" : "Navegar entre semanas"} className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={monthView
              ? agendaHref(scope, normalizedQuery, { mes: shiftMonth(month, -1), dia: undefined })
              : agendaHref(scope, normalizedQuery, { semana: formatIsoWeek(previousWeek), dia: undefined })}
            aria-label={monthView ? "Mês anterior" : "Semana anterior"}
            className="glass-button rounded-full px-3 py-1.5 text-xs font-medium"
          >
            ←
          </Link>
          <span className="min-w-[10rem] text-center text-xs font-medium" data-testid="agenda-week">
            {periodLabel}
          </span>
          <Link
            href={monthView
              ? agendaHref(scope, normalizedQuery, { mes: shiftMonth(month, 1), dia: undefined })
              : agendaHref(scope, normalizedQuery, { semana: formatIsoWeek(nextWeek), dia: undefined })}
            aria-label={monthView ? "Próximo mês" : "Próxima semana"}
            className="glass-button rounded-full px-3 py-1.5 text-xs font-medium"
          >
            →
          </Link>
          {(monthView ? month !== today.slice(0, 7) : !weekDates.includes(today)) && (
            <Link
              href={monthView
                ? agendaHref(scope, normalizedQuery, { mes: today.slice(0, 7), dia: undefined })
                : agendaHref(scope, normalizedQuery, { semana: formatIsoWeek(mondayOnOrBefore(today)), dia: undefined })}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium transition hover:bg-white/10"
            >
              Hoje
            </Link>
          )}
          <span className="ml-2 inline-flex rounded-full border border-white/10 bg-white/5 p-0.5 text-xs" role="group" aria-label="Visão">
            <Link
              href={agendaHref(scope, { ...normalizedQuery, visao: undefined, mes: undefined }, { semana: formatIsoWeek(monthView ? mondayOnOrBefore(today) : weekStart) })}
              aria-current={!monthView ? "page" : undefined}
              className={`rounded-full px-3 py-1 ${!monthView ? "theme-pill-info font-medium" : "text-foreground/70"}`}
            >
              Semana
            </Link>
            <Link
              href={agendaHref(scope, { ...normalizedQuery, semana: undefined, dia: undefined }, { visao: "mes", mes: monthView ? month : weekStart.slice(0, 7) })}
              aria-current={monthView ? "page" : undefined}
              className={`rounded-full px-3 py-1 ${monthView ? "theme-pill-info font-medium" : "text-foreground/70"}`}
            >
              Mês
            </Link>
          </span>
        </nav>
      </div>

      {/* SAM-67 — one athlete's calendar: events, goals and unavailability over the period, zones, assign from the catalog. */}
      {overlay && query.atleta && (
        <section className="glass space-y-2 rounded-[20px] p-4 text-sm" data-testid="athlete-calendar-overlay">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">Calendário de {overlay.athleteName}</p>
            <AssignFromCatalogDialog athleteId={query.atleta} athleteName={overlay.athleteName} date={selectedDay} scope={scope.kind === "school" ? { kind: "school", schoolId: scope.schoolId } : { kind: "independent" }} />
          </div>
          <p className="text-xs text-foreground/60">{overlay.zonesReference}</p>
          <ul className="space-y-0.5 text-xs" data-testid="overlay-items">
            {overlay.events.map((item) => <li key={item.id}>Evento{item.main ? " (prova principal)" : ""}: {item.name}{item.option ? ` · ${item.option}` : ""} — {item.date.split("-").reverse().join("/")}</li>)}
            {overlay.goals.map((item) => <li key={item.id}>Meta {item.agreed ? "pactuada" : "desejada"}: {item.description} — até {item.date.split("-").reverse().join("/")}</li>)}
            {overlay.unavailability.map((item) => <li key={item.id}>Indisponível: {item.startLocalDate.split("-").reverse().join("/")} a {item.endLocalDate.split("-").reverse().join("/")} — {item.reason}</li>)}
            {overlay.events.length + overlay.goals.length + overlay.unavailability.length === 0 && <li className="text-foreground/55">Sem eventos, metas ou indisponibilidade neste período.</li>}
          </ul>
        </section>
      )}

      {/* Filters travel in the URL: a plain GET form needs no client state and the result is shareable. */}
      <form
        method="get"
        aria-label="Filtrar agenda"
        className="glass flex flex-wrap items-end gap-3 rounded-[20px] p-4 text-xs"
      >
        {monthView
          ? <><input type="hidden" name="visao" value="mes" /><input type="hidden" name="mes" value={month} /></>
          : <input type="hidden" name="semana" value={normalizedQuery.semana} />}
        {scope.kind === "school" && (
          <label className="space-y-1">
            <span className="block font-medium uppercase tracking-wide text-foreground/55">Turma</span>
            <select name="turma" defaultValue={query.turma ?? ""} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <option value="">Todas</option>
              {data.teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="space-y-1">
          <span className="block font-medium uppercase tracking-wide text-foreground/55">Modalidade</span>
          <select name="modalidade" defaultValue={query.modalidade ?? ""} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <option value="">Todas</option>
            {[...new Set([...data.sportTypes, ...(query.modalidade ? [query.modalidade] : [])])].map((sport) => (
              <option key={sport} value={sport}>{resolveSportLabel(sport) ?? sport}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block font-medium uppercase tracking-wide text-foreground/55">Atleta</span>
          <select name="atleta" defaultValue={query.atleta ?? ""} className="max-w-[14rem] rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <option value="">Todos</option>
            {data.athletes.map((athlete) => (
              <option key={athlete.id} value={athlete.id}>{athlete.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block font-medium uppercase tracking-wide text-foreground/55">Tipo</span>
          <select name="tipo" defaultValue={query.tipo ?? ""} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            {TYPE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {scope.kind === "school" && (
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" name="sem-professor" value="1" defaultChecked={query["sem-professor"] === "1"} />
            <span>Só sem professor</span>
          </label>
        )}
        <button type="submit" className="glass-button-primary rounded-full px-4 py-2 font-medium">Filtrar</button>
        {hasFilters && (
          <Link href={agendaHref(scope, monthView ? { visao: "mes", mes: month } : { semana: normalizedQuery.semana }, {})} className="underline-offset-4 hover:underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <p className="text-xs text-foreground/55" data-testid="agenda-summary">{summaryText}</p>

      {data.items.length === 0 ? (
        <EmptyState
          title={monthView ? "Mês vazio" : "Semana vazia"}
          description={hasFilters
            ? "Nada corresponde aos filtros. Limpe-os ou troque o período."
            : "Prescreva um treino a partir da ficha de um atleta, ou espere a próxima sincronização do relógio: tudo aparece aqui no horário em que acontece."}
        />
      ) : monthView ? (
        <div className="glass overflow-x-auto rounded-[20px]" data-testid="agenda-month-grid">
          <table className="w-full table-fixed border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/8 text-left uppercase tracking-wide text-foreground/50">
                {WEEKDAY_LABELS.map((label) => (
                  <th key={label} scope="col" className="px-2 py-3 font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {weeks.map((row) => (
                <tr key={row.days[0]!.date} className="align-top">
                  {row.days.map((day) => {
                    const inMonth = day.date.startsWith(month);
                    const count = day.slots.reduce((sum, slot) => sum + slot.entries.length, 0);
                    return (
                      <td key={day.date} className={`h-24 px-1.5 py-2 ${inMonth ? "" : "opacity-40"}`} aria-current={day.date === today ? "date" : undefined}>
                        <div className={`mb-1 text-[11px] font-medium ${day.date === today ? "text-foreground" : "text-foreground/60"}`}>
                          {Number(day.date.slice(8, 10))}{count > 0 ? ` · ${count}` : ""}
                        </div>
                        <div className="space-y-1">
                          {day.slots.slice(0, 3).map((slot) => (
                            <AgendaSlotChip key={slot.key} schoolId={schoolId} slot={toView(slot, row.days.map((d) => d.date))} timeZone={data.timeZone} compact />
                          ))}
                          {day.slots.length > 3 && (
                            <Link
                              href={agendaHref(scope, { ...normalizedQuery, visao: undefined, mes: undefined }, { semana: formatIsoWeek(row.days[0]!.date), dia: day.date })}
                              className="block text-[11px] text-foreground/60 underline-offset-4 hover:underline"
                            >
                              +{day.slots.length - 3} horário(s)
                            </Link>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* Desktop: seven columns over hour bands. */}
          <div className="glass hidden overflow-x-auto rounded-[20px] md:block" data-testid="agenda-week-grid">
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/8 text-left uppercase tracking-wide text-foreground/50">
                  <th scope="col" className="w-14 px-2 py-3 font-medium">Hora</th>
                  {week.days.map((day, index) => (
                    <th
                      key={day.date}
                      scope="col"
                      className={`px-2 py-3 font-medium ${day.date === today ? "text-foreground" : ""}`}
                      aria-current={day.date === today ? "date" : undefined}
                    >
                      {WEEKDAY_LABELS[index]} <span className="normal-case text-foreground/70">{dayNumberLabel(day.date)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {week.hours.map((hour) => (
                  <tr key={hour} className="align-top">
                    <th scope="row" className="px-2 py-2 text-left font-medium tabular-nums text-foreground/50">
                      {String(hour).padStart(2, "0")}:00
                    </th>
                    {week.days.map((day) => (
                      <td key={day.date} className="px-1.5 py-2">
                        <div className="space-y-1">
                          {day.slots.filter((slot) => slot.hour === hour).map((slot) => (
                            <AgendaSlotChip key={slot.key} schoolId={schoolId} slot={toView(slot, weekDates)} timeZone={data.timeZone} />
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: one day at a time, same slots. */}
          <div className="space-y-3 md:hidden" data-testid="agenda-day-view">
            <nav aria-label="Escolher o dia" className="overflow-x-auto">
              <ul className="flex min-w-max gap-2">
                {week.days.map((day, index) => (
                  <li key={day.date}>
                    <Link
                      href={agendaHref(scope, normalizedQuery, { dia: day.date })}
                      aria-current={day.date === selectedDay ? "page" : undefined}
                      className={`block rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        day.date === selectedDay
                          ? "theme-pill-info font-medium"
                          : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10"
                      }`}
                    >
                      {WEEKDAY_LABELS[index]} {dayNumberLabel(day.date)}
                      {day.slots.length > 0 ? ` · ${day.slots.reduce((sum, slot) => sum + slot.entries.length, 0)}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="glass rounded-[20px] p-3">
              {(() => {
                const day = week.days.find((entry) => entry.date === selectedDay);
                if (!day || day.slots.length === 0) {
                  return <p className="px-1 py-2 text-xs text-foreground/55">Nada neste dia.</p>;
                }
                return (
                  <ul className="space-y-2">
                    {day.slots.map((slot) => (
                      <li key={slot.key}>
                        <AgendaSlotChip schoolId={schoolId} slot={toView(slot, weekDates)} timeZone={data.timeZone} />
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
