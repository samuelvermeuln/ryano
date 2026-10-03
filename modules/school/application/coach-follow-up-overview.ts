/**
 * SAM-67 — the coach's panel (§19.2): counters with a visible definition and
 * a period filter, each opening its filtered list. Only what the coach
 * answers for: their preparations and their prescriptions, in one school or
 * across all of them (independent hub). Nothing invented: milestones exist
 * only from SAM-71, so that counter says there are none registered.
 */
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_SYNC_WINDOW_HOURS, REST_DAY_SPORT } from "../domain/execution-state";
import { SchoolError } from "../domain/errors";
import { ACTIVE_MATCH_STATUSES } from "./match-audit";

export const OVERVIEW_LISTS = ["novos-eventos", "sem-analise", "marcos", "extras", "revisoes", "sem-registro"] as const;
export type OverviewList = (typeof OVERVIEW_LISTS)[number];

export const OVERVIEW_DEFINITIONS: Record<OverviewList, { label: string; definition: string }> = {
  "novos-eventos": { label: "Novos eventos", definition: "Eventos que seus alunos cadastraram no período." },
  "sem-analise": { label: "Acompanhamentos sem análise", definition: "Eventos sob sua responsabilidade aguardando a primeira análise." },
  marcos: { label: "Marcos vencidos", definition: "Marcos com data passada e sem evidência. Os marcos chegam com o planejamento por fases." },
  extras: { label: "Atividades extras", definition: "Atividades dos seus alunos no período sem sessão prescrita associada." },
  revisoes: { label: "Revisões pendentes", definition: "Sessões realizadas (ou relatadas) no período sem a sua revisão, e eventos com resultado aguardando o parecer." },
  "sem-registro": { label: "Sessões sem registro", definition: "Sessões do período já fora da janela de sincronização, sem atividade nem relato do aluno." },
};

export type OverviewItem = { id: string; title: string; subtitle: string; href: string };

const hubBase = (schoolId: string | null, athleteId: string) => `/professor/${schoolId ?? "independente"}/atletas/${athleteId}`;
const day = (date: Date) => date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export class GetCoachFollowUpOverview {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, options: { schoolId?: string | null; days: number }) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const coach = await this.db.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
    if (!coach) throw new SchoolError("FORBIDDEN", "Apenas professores.", 403);
    const now = this.clock();
    const since = new Date(now.getTime() - options.days * 86_400_000);
    const schoolFilter = options.schoolId ? { schoolId: options.schoolId } : {};
    const recordedBefore = new Date(now.getTime() - DEFAULT_SYNC_WINDOW_HOURS * 3_600_000);

    const links = await this.db.coachAthleteAssignment.findMany({
      where: { coachId: coach.id, status: "ACTIVE", endedAt: null, ...schoolFilter },
      select: { athleteId: true, schoolId: true },
    });
    const athleteSchool = new Map(links.map((link) => [link.athleteId, link.schoolId]));
    const athleteIds = [...athleteSchool.keys()];

    const [newEvents, withoutAnalysis, extras, executedRows, reviewPreparations, withoutRecord] = await Promise.all([
      this.db.eventPreparation.findMany({
        where: { coachId: coach.id, ...schoolFilter, participation: { createdAt: { gte: since }, status: { not: "CANCELLED" } } },
        select: { id: true, schoolId: true, participation: { select: { id: true, athleteId: true, athlete: { select: { name: true } }, event: { select: { name: true, startLocalDate: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.db.eventPreparation.findMany({
        where: { coachId: coach.id, ...schoolFilter, status: "AWAITING_ASSESSMENT" },
        select: { id: true, schoolId: true, participation: { select: { id: true, athleteId: true, athlete: { select: { name: true } }, event: { select: { name: true, startLocalDate: true } } } } },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      athleteIds.length === 0 ? [] : this.db.activity.findMany({
        where: { userId: { in: athleteIds }, startedAt: { gte: since }, duplicateOfActivityId: null, workoutExecutions: { none: { matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } } } },
        select: { id: true, userId: true, name: true, sportType: true, startedAt: true, user: { select: { name: true } } },
        orderBy: { startedAt: "desc" },
        take: 100,
      }),
      this.db.workoutAssignment.findMany({
        where: {
          coachId: coach.id, ...schoolFilter, scheduledAt: { gte: since, lte: now }, status: { notIn: ["CANCELLED", "RESCHEDULED"] },
          reviews: { none: {} },
          OR: [{ executions: { some: { matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } } } }, { feedbacks: { some: { completion: { not: null } } } }],
        },
        select: { id: true, athleteId: true, schoolId: true, scheduledAt: true, workout: { select: { title: true } }, athlete: { select: { name: true } } },
        orderBy: { scheduledAt: "desc" },
        take: 100,
      }),
      this.db.eventPreparation.findMany({
        where: { coachId: coach.id, ...schoolFilter, status: "REVIEW_PENDING" },
        select: { id: true, schoolId: true, participation: { select: { id: true, athleteId: true, athlete: { select: { name: true } }, event: { select: { name: true, startLocalDate: true } } } } },
        take: 100,
      }),
      this.db.workoutAssignment.findMany({
        where: {
          coachId: coach.id, ...schoolFilter, scheduledAt: { gte: since, lte: recordedBefore },
          status: { notIn: ["CANCELLED", "RESCHEDULED", "JUSTIFIED", "MISSED", "COMPLETED", "PARTIALLY_COMPLETED"] },
          workout: { sportType: { not: REST_DAY_SPORT } },
          executions: { none: { matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } } },
          feedbacks: { none: { completion: { not: null } } },
        },
        select: { id: true, athleteId: true, schoolId: true, scheduledAt: true, workout: { select: { title: true } }, athlete: { select: { name: true } } },
        orderBy: { scheduledAt: "desc" },
        take: 100,
      }),
    ]);

    const eventItem = (row: (typeof newEvents)[number]): OverviewItem => ({
      id: row.id,
      title: `${row.participation.event.name} · ${row.participation.athlete.name ?? "aluno"}`,
      subtitle: `Evento em ${row.participation.event.startLocalDate.split("-").reverse().join("/")}`,
      href: `${hubBase(row.schoolId, row.participation.athleteId)}/eventos/${row.participation.id}`,
    });
    const sessionItem = (row: (typeof executedRows)[number]): OverviewItem => ({
      id: row.id,
      title: `${row.workout?.title ?? "Treino"} · ${row.athlete.name ?? "aluno"}`,
      subtitle: row.scheduledAt ? `Previsto para ${day(row.scheduledAt)}` : "Sem data",
      href: `${hubBase(row.schoolId, row.athleteId)}/treinos/${row.id}`,
    });
    const lists: Record<OverviewList, OverviewItem[]> = {
      "novos-eventos": newEvents.map(eventItem),
      "sem-analise": withoutAnalysis.map(eventItem),
      marcos: [],
      extras: extras.map((activity) => ({
        id: activity.id,
        title: `${activity.name ?? activity.sportType} · ${activity.user.name ?? "aluno"}`,
        subtitle: `Em ${day(activity.startedAt)}`,
        href: `${hubBase(athleteSchool.get(activity.userId) ?? null, activity.userId)}/atividades/${activity.id}`,
      })),
      revisoes: [...reviewPreparations.map(eventItem), ...executedRows.map(sessionItem)],
      "sem-registro": withoutRecord.map(sessionItem),
    };
    return {
      days: options.days,
      counters: OVERVIEW_LISTS.map((list) => ({ list, ...OVERVIEW_DEFINITIONS[list], count: lists[list].length })),
      lists,
    };
  }
}
