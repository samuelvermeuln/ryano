/**
 * SAM-16 — Agenda semanal do professor.
 *
 * One week of every athlete this coach may read, positioned by the school's
 * wall clock: seven day columns over hour bands on desktop, one day at a time
 * on mobile. Athletes prescribed at the same time collapse into one chip
 * (`buildWeeklyAgenda`), expanded in a centered modal.
 *
 * Every parameter lives in the URL (`semana`, `turma`, `modalidade`, `atleta`,
 * `sem-professor`, `dia`), so a filtered week is shareable and week navigation
 * keeps the filters. Authorization is the use case's: the page only formats.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
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
  type AgendaSlot,
} from "@/modules/school/presentation/weekly-agenda";
import { ASSIGNMENT_STATUS_LABELS } from "@/modules/school/presentation/workout-labels";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AgendaSlotChip, type AgendaEntryView, type AgendaSlotView } from "./agenda-slot";

export const dynamic = "force-dynamic";

type Query = {
  semana?: string;
  turma?: string;
  modalidade?: string;
  atleta?: string;
  "sem-professor"?: string;
  dia?: string;
};

type PageProps = { params: Promise<{ schoolId: string }>; searchParams: Promise<Query> };

const agenda = new GetCoachWeeklyAgenda(prisma);

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  COMPLETED: "success",
  PARTIALLY_COMPLETED: "success",
  MISSED: "danger",
  RESCHEDULED: "warning",
};

const WEEKDAY_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

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

function agendaHref(schoolId: string, query: Query, patch: Partial<Query>): string {
  const next: Query = { ...query, ...patch };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value) params.set(key, value);
  }
  const suffix = params.toString();
  return `/professor/${schoolId}/agenda${suffix ? `?${suffix}` : ""}`;
}

export default async function AgendaPage({ params, searchParams }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;
  const query = await searchParams;

  // The school's zone decides which Monday "this week" is; it is read once
  // here so an invalid `semana` can fall back to the current week.
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } });
  if (!school) notFound();
  const today = todayLocalDate(new Date(), school.timezone);
  const weekStart = (query.semana && mondayOfIsoWeek(query.semana)) || mondayOnOrBefore(today);
  const normalizedQuery: Query = { ...query, semana: formatIsoWeek(weekStart) };

  let data: Awaited<ReturnType<typeof agenda.execute>>;
  try {
    data = await agenda.execute(session.user.id, schoolId, {
      weekStart,
      ...(query.turma ? { teamId: query.turma } : {}),
      ...(query.modalidade ? { sportType: query.modalidade } : {}),
      ...(query.atleta ? { athleteId: query.atleta } : {}),
      ...(query["sem-professor"] === "1" ? { withoutCoach: true } : {}),
    });
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const week = buildWeeklyAgenda(data.items, weekStart, data.timeZone);
  const weekDates = week.days.map((day) => day.date);
  const selectedDay = query.dia && isValidLocalDate(query.dia) && weekDates.includes(query.dia)
    ? query.dia
    : weekDates.includes(today) ? today : weekStart;

  const toView = (slot: AgendaSlot): AgendaSlotView => {
    const described = describeAgendaSlot(slot, resolveSportLabel);
    return {
      key: slot.key,
      time: slot.time,
      dayLabel: dayLongLabel(slot.date, weekDates.indexOf(slot.date)),
      who: described.who,
      detail: described.detail,
      entries: slot.entries.map((entry): AgendaEntryView => ({
        assignmentId: entry.assignmentId,
        athleteId: entry.athlete.id,
        athleteName: entry.athlete.name,
        title: entry.title,
        sportLabel: entry.sportType ? resolveSportLabel(entry.sportType) ?? entry.sportType : null,
        team: entry.team?.name ?? null,
        coach: entry.coach?.name ?? null,
        statusLabel: ASSIGNMENT_STATUS_LABELS[entry.status] ?? entry.status,
        statusTone: STATUS_TONE[entry.status] ?? "neutral",
        localDateTime: `${entry.localDate}T${entry.localTime}`,
        href: `/professor/${schoolId}/atletas/${entry.athlete.id}/treinos/${entry.assignmentId}`,
        canReschedule: entry.canReschedule,
      })),
    };
  };

  const hasFilters = Boolean(query.turma || query.modalidade || query.atleta || query["sem-professor"]);
  const totalAthletes = new Set(data.items.map((item) => item.athlete.id)).size;
  const previousWeek = addCalendarDays(weekStart, -7);
  const nextWeek = addCalendarDays(weekStart, 7);

  return (
    <div className="space-y-6 p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Agenda</h1>
          <p className="mt-1 text-sm text-foreground/60">
            {data.seesWholeSchool ? "Todos os atletas da escola" : "Seus atletas"} na semana, no horário da escola
            {" "}({data.timeZone.replace(/_/g, " ")}).
          </p>
        </div>
        <nav aria-label="Navegar entre semanas" className="flex items-center gap-2 text-sm">
          <Link
            href={agendaHref(schoolId, normalizedQuery, { semana: formatIsoWeek(previousWeek), dia: undefined })}
            aria-label="Semana anterior"
            className="glass-button rounded-full px-3 py-1.5 text-xs font-medium"
          >
            ←
          </Link>
          <span className="min-w-[10rem] text-center text-xs font-medium" data-testid="agenda-week">
            {weekRangeLabel(weekStart)} · {formatIsoWeek(weekStart)}
          </span>
          <Link
            href={agendaHref(schoolId, normalizedQuery, { semana: formatIsoWeek(nextWeek), dia: undefined })}
            aria-label="Próxima semana"
            className="glass-button rounded-full px-3 py-1.5 text-xs font-medium"
          >
            →
          </Link>
          {!weekDates.includes(today) && (
            <Link
              href={agendaHref(schoolId, normalizedQuery, { semana: formatIsoWeek(mondayOnOrBefore(today)), dia: undefined })}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium transition hover:bg-white/10"
            >
              Hoje
            </Link>
          )}
        </nav>
      </div>

      {/* Filters travel in the URL: a plain GET form needs no client state and the result is shareable. */}
      <form
        method="get"
        aria-label="Filtrar agenda"
        className="glass flex flex-wrap items-end gap-3 rounded-[20px] p-4 text-xs"
      >
        <input type="hidden" name="semana" value={normalizedQuery.semana} />
        <label className="space-y-1">
          <span className="block font-medium uppercase tracking-wide text-foreground/55">Turma</span>
          <select name="turma" defaultValue={query.turma ?? ""} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <option value="">Todas</option>
            {data.teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </label>
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
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" name="sem-professor" value="1" defaultChecked={query["sem-professor"] === "1"} />
          <span>Só sem professor</span>
        </label>
        <button type="submit" className="glass-button-primary rounded-full px-4 py-2 font-medium">Filtrar</button>
        {hasFilters && (
          <Link href={agendaHref(schoolId, { semana: normalizedQuery.semana }, {})} className="underline-offset-4 hover:underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <p className="text-xs text-foreground/55" data-testid="agenda-summary">
        {data.items.length === 0
          ? "Nenhuma prescrição nesta semana."
          : `${data.items.length} prescrição(ões) · ${totalAthletes} atleta(s)`}
      </p>

      {data.items.length === 0 ? (
        <EmptyState
          title="Semana vazia"
          description={hasFilters
            ? "Nenhuma prescrição corresponde aos filtros. Limpe-os ou troque a semana."
            : "Prescreva um treino a partir da ficha de um atleta e ele aparece aqui no horário marcado."}
        />
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
                            <AgendaSlotChip key={slot.key} schoolId={schoolId} slot={toView(slot)} timeZone={data.timeZone} />
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
                      href={agendaHref(schoolId, normalizedQuery, { dia: day.date })}
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
                  return <p className="px-1 py-2 text-xs text-foreground/55">Nenhuma prescrição neste dia.</p>;
                }
                return (
                  <ul className="space-y-2">
                    {day.slots.map((slot) => (
                      <li key={slot.key}>
                        <AgendaSlotChip schoolId={schoolId} slot={toView(slot)} timeZone={data.timeZone} />
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
