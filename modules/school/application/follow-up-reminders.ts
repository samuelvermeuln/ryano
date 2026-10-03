/**
 * SAM-56 — scheduled reminders and the job that materializes them
 * (§7.2–7.3, §21.4–21.5, AC20).
 *
 * `syncParticipationReminders` computes the reminders a participation should
 * have NOW (D−N in the event's zone, result missing, first-analysis deadline
 * in the organization's working calendar) and reconciles the table: obsolete
 * PENDING rows are CANCELLED, missing ones are inserted with a dedupe key
 * that embeds the date — so moving the event cancels the old D−7 and creates
 * a new one, and a reminder already SENT is never sent again.
 *
 * `RunFollowUpReminders` (job) sends what is due, each reminder isolated
 * (one failure never stops the others), recipients resolved at fire time
 * (a coach who lost the link is not reminded) and notices deduplicated, so
 * running the job twice changes nothing. The in-app notice is always written;
 * quiet hours only postpone an external channel (`payload.externalNotBefore`).
 * No external channel is created here: today only WhatsApp exists and it
 * carries reports, so these kinds stay in-app until a channel adopts them.
 */
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { NotificationService, type UserNotificationKind } from "@/modules/shared/notifications";
import {
  DEFAULT_FOLLOW_UP_POLICY,
  deferForQuietHours,
  eventReminderPlan,
  firstAnalysisDeadline,
  isRoutineNotice,
  resultMissingAt,
  type FollowUpPolicyValues,
} from "../domain/follow-up-schedule";
import { todayLocalDate } from "../domain/local-date";
import { CanReadAthleteCurrentData } from "./can-read-athlete-current-data";
import { COACH_FOLLOW_UP_HREF, schoolFollowUpHref } from "./event-follow-up-triggers";
import { raiseFollowUp, schoolManagerUserIds } from "./follow-up-tasks";

type Clock = () => Date;
type Db = PrismaClient | Prisma.TransactionClient;

/** The organization's policy: the school's when the follow-up is in a school, the coach's when independent, else the defaults. */
export async function loadFollowUpPolicy(db: Db, scope: { schoolId: string | null; coachId: string | null }): Promise<FollowUpPolicyValues> {
  const row = scope.schoolId
    ? await db.followUpPolicy.findUnique({ where: { schoolId: scope.schoolId } })
    : scope.coachId
      ? await db.followUpPolicy.findUnique({ where: { coachId: scope.coachId } })
      : null;
  if (!row) return DEFAULT_FOLLOW_UP_POLICY;
  return {
    firstAnalysisBusinessDays: row.firstAnalysisBusinessDays,
    reminderDaysBefore: row.reminderDaysBefore,
    workingDays: row.workingDays,
    timeZone: row.timeZone,
    notifyCoordinationOnOverdue: row.notifyCoordinationOnOverdue,
    syncWindowHours: row.syncWindowHours,
    sessionLoadMethod: row.sessionLoadMethod === "SRPE" ? "SRPE" : null,
  };
}

type Desired = { kind: string; sourceType: string; sourceId: string; audience: "ATHLETE" | "RESPONSIBLE" | "COORDINATION"; dueAt: Date; dedupeKey: string; payload: Prisma.InputJsonValue };

const AWAITING_ANALYSIS = ["AWAITING_ASSESSMENT", "UNASSIGNED"];

export async function syncParticipationReminders(db: Db, clock: Clock, participationId: string): Promise<{ created: number; cancelled: number }> {
  const participation = await db.athleteEventParticipation.findUnique({
    where: { id: participationId },
    select: {
      id: true, athleteId: true, status: true,
      event: { select: { id: true, name: true, startLocalDate: true, endLocalDate: true, dateConfirmed: true, timeZone: true, status: true } },
      preparation: { select: { id: true, status: true, coachId: true, schoolId: true, createdAt: true } },
    },
  });
  if (!participation) return { created: 0, cancelled: 0 };
  const now = clock();
  const desired: Desired[] = [];
  const { event, preparation } = participation;
  const active = participation.status !== "CANCELLED" && event.status !== "CANCELLED";

  if (active) {
    const policy = await loadFollowUpPolicy(db, { schoolId: preparation?.schoolId ?? null, coachId: preparation?.schoolId ? null : preparation?.coachId ?? null });
    for (const { daysBefore, dueAt } of eventReminderPlan(event, policy.reminderDaysBefore, now)) {
      for (const audience of ["ATHLETE", "RESPONSIBLE"] as const) {
        desired.push({
          kind: "EVENT_APPROACHING", sourceType: "AthleteEventParticipation", sourceId: participation.id, audience, dueAt,
          dedupeKey: `event-approaching:${participation.id}:${event.startLocalDate}:D${daysBefore}:${audience}`,
          payload: { daysBefore, eventName: event.name, startLocalDate: event.startLocalDate },
        });
      }
    }
    const resultDue = resultMissingAt(event, now);
    if (resultDue) {
      desired.push({
        kind: "EVENT_RESULT_MISSING", sourceType: "AthleteEventParticipation", sourceId: participation.id, audience: "ATHLETE", dueAt: resultDue,
        dedupeKey: `result-missing:${participation.id}:${event.endLocalDate ?? event.startLocalDate}`,
        payload: { eventName: event.name },
      });
    }
    // The first-analysis deadline only exists while someone answers for it (responsible or school queue).
    if (preparation && AWAITING_ANALYSIS.includes(preparation.status) && (preparation.coachId || preparation.schoolId)) {
      const { dueAt, dueLocalDate } = firstAnalysisDeadline(preparation.createdAt, policy);
      desired.push({
        kind: "FIRST_ANALYSIS_OVERDUE", sourceType: "EventPreparation", sourceId: preparation.id,
        audience: preparation.coachId ? "RESPONSIBLE" : "COORDINATION", dueAt,
        dedupeKey: `first-analysis:${preparation.id}`,
        payload: { dueLocalDate, eventName: event.name },
      });
    }
  }

  const sources = [participation.id, ...(preparation ? [preparation.id] : [])];
  const pending = await db.scheduledReminder.findMany({ where: { sourceId: { in: sources }, status: "PENDING" }, select: { id: true, dedupeKey: true } });
  const wanted = new Set(desired.map((item) => item.dedupeKey));
  const obsolete = pending.filter((row) => !wanted.has(row.dedupeKey)).map((row) => row.id);
  if (obsolete.length > 0) {
    await db.scheduledReminder.updateMany({ where: { id: { in: obsolete }, status: "PENDING" }, data: { status: "CANCELLED", updatedAt: now } });
  }
  const { count } = desired.length === 0
    ? { count: 0 }
    : await db.scheduledReminder.createMany({
      data: desired.map((item) => ({ id: randomUUID(), ...item, athleteId: participation.athleteId, createdAt: now, updatedAt: now })),
      skipDuplicates: true,
    });
  return { created: count, cancelled: obsolete.length };
}

const MAX_ATTEMPTS = 5;

type ReminderRow = Prisma.ScheduledReminderGetPayload<object>;

export class RunFollowUpReminders {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  /** `sourceIds` narrows the batch (E2E clock simulation touches only its own data). */
  async execute(options: { limit?: number; sourceIds?: string[] } = {}) {
    const now = this.clock();
    const due = await this.db.scheduledReminder.findMany({
      where: { status: "PENDING", dueAt: { lte: now }, ...(options.sourceIds ? { sourceId: { in: options.sourceIds } } : {}) },
      orderBy: { dueAt: "asc" },
      take: Math.min(Math.max(options.limit ?? 200, 1), 500),
    });
    const summary = { sent: 0, skipped: 0, failed: 0 };
    for (const reminder of due) {
      try {
        const outcome = await this.db.$transaction((tx) => this.deliver(tx, reminder, now), { maxWait: 5_000, timeout: 20_000 });
        summary[outcome] += 1;
      } catch (error) {
        summary.failed += 1;
        const attempts = reminder.attempts + 1;
        // Only the error class/message — never tokens or personal data.
        const message = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 500) : "erro desconhecido";
        await this.db.scheduledReminder.updateMany({
          where: { id: reminder.id, status: "PENDING" },
          data: { attempts, lastError: message, ...(attempts >= MAX_ATTEMPTS ? { status: "SKIPPED" } : {}), updatedAt: now },
        });
      }
    }
    return summary;
  }

  private async deliver(tx: Prisma.TransactionClient, reminder: ReminderRow, now: Date): Promise<"sent" | "skipped"> {
    // Claim first: a concurrent run that already took it makes this a no-op.
    const claimed = await tx.scheduledReminder.updateMany({ where: { id: reminder.id, status: "PENDING" }, data: { status: "SENT", sentAt: now, attempts: { increment: 1 }, updatedAt: now } });
    if (claimed.count === 0) return "skipped";

    const context = await this.contextOf(tx, reminder);
    if (!context) {
      await tx.scheduledReminder.update({ where: { id: reminder.id }, data: { status: "SKIPPED" } });
      return "skipped";
    }
    const recipients = await this.recipients(tx, reminder, context, now);
    if (recipients.length === 0) {
      await tx.scheduledReminder.update({ where: { id: reminder.id }, data: { status: "SKIPPED" } });
      return "skipped";
    }
    const payload = (reminder.payload ?? {}) as { daysBefore?: number; eventName?: string; dueLocalDate?: string };
    const notifications = new NotificationService(tx, () => now);
    for (const recipient of recipients) {
      const text = noticeText(reminder.kind, recipient.role, payload, context.athleteName);
      const preference = await tx.notificationPreference.findUnique({ where: { userId: recipient.userId }, select: { timezone: true, quietHoursStart: true, quietHoursEnd: true, dailySummary: true } });
      const zone = preference?.timezone ?? DEFAULT_FOLLOW_UP_POLICY.timeZone;
      const externalNotBefore = deferForQuietHours(now, preference?.quietHoursStart ?? null, preference?.quietHoursEnd ?? null, zone);
      const digest = isRoutineNotice(reminder.kind) && preference?.dailySummary === true;
      await notifications.notify({
        userId: recipient.userId,
        kind: (digest ? "SESSION_WITHOUT_RECORD" : reminder.kind) as UserNotificationKind,
        title: digest ? "Resumo do dia" : text.title,
        body: digest ? "Itens de rotina do dia para conferir." : text.body,
        href: recipient.href,
        // The digest is one notice per user per local day; routine items join it (§7.3).
        dedupeKey: digest ? `digest:${recipient.userId}:${todayLocalDate(now, zone)}` : `${reminder.dedupeKey}:${recipient.userId}`,
        payload: { reminderId: reminder.id, externalNotBefore: externalNotBefore.toISOString() },
      });
    }
    if (reminder.kind === "FIRST_ANALYSIS_OVERDUE" && context.preparation) {
      // The open "avaliar" task gets the deadline and turns HIGH; the coordination keeps its own queue task.
      const coachRecipient = recipients.find((recipient) => recipient.role === "coach");
      await raiseFollowUp(tx, now, {
        kind: "FIRST_ANALYSIS_OVERDUE", sourceType: "EventPreparation", sourceId: context.preparation.id, athleteId: reminder.athleteId,
        assigneeUserId: coachRecipient?.userId ?? null, schoolId: context.preparation.schoolId,
        title: `Primeira análise atrasada: evento de ${context.athleteName}`,
        href: coachRecipient ? COACH_FOLLOW_UP_HREF : context.preparation.schoolId ? schoolFollowUpHref(context.preparation.schoolId) : null,
        dedupeKey: `preparation-assess:${context.preparation.id}`, priority: "HIGH", dueAt: reminder.dueAt,
        reason: "prazo da primeira análise vencido", actorUserId: null,
      });
    }
    return "sent";
  }

  /** The source is still relevant: participation and event active; the preparation still waiting for the first analysis. */
  private async contextOf(tx: Prisma.TransactionClient, reminder: ReminderRow) {
    const athlete = await tx.user.findUnique({ where: { id: reminder.athleteId }, select: { name: true } });
    const athleteName = athlete?.name ?? "atleta";
    if (reminder.sourceType === "EventPreparation") {
      const preparation = await tx.eventPreparation.findUnique({
        where: { id: reminder.sourceId },
        select: { id: true, status: true, coachId: true, schoolId: true, participation: { select: { status: true, event: { select: { status: true } } } } },
      });
      if (!preparation || !AWAITING_ANALYSIS.includes(preparation.status) || preparation.participation.status === "CANCELLED" || preparation.participation.event.status === "CANCELLED") return null;
      return { athleteName, preparation };
    }
    const participation = await tx.athleteEventParticipation.findUnique({
      where: { id: reminder.sourceId },
      select: { status: true, event: { select: { status: true } }, preparation: { select: { id: true, status: true, coachId: true, schoolId: true } } },
    });
    if (!participation || participation.status === "CANCELLED" || participation.event.status === "CANCELLED") return null;
    return { athleteName, preparation: participation.preparation };
  }

  private async recipients(tx: Prisma.TransactionClient, reminder: ReminderRow, context: NonNullable<Awaited<ReturnType<RunFollowUpReminders["contextOf"]>>>, now: Date) {
    const list: Array<{ userId: string; role: "athlete" | "coach" | "coordination"; href: string | null }> = [];
    const preparation = context.preparation;
    if (reminder.audience === "ATHLETE") list.push({ userId: reminder.athleteId, role: "athlete", href: null });
    if (reminder.audience === "RESPONSIBLE" && preparation?.coachId && preparation.status !== "CLOSED") {
      const coach = await tx.coachProfile.findUnique({ where: { id: preparation.coachId }, select: { userId: true } });
      // Resolved now: a coach who lost the link is never reminded (§7.3).
      if (coach && await new CanReadAthleteCurrentData(tx as PrismaClient, () => now).execute(coach.userId, { athleteId: reminder.athleteId, schoolId: preparation.schoolId })) {
        list.push({ userId: coach.userId, role: "coach", href: COACH_FOLLOW_UP_HREF });
      }
    }
    const coordination = reminder.audience === "COORDINATION"
      || (reminder.kind === "FIRST_ANALYSIS_OVERDUE" && preparation?.schoolId
        && (await loadFollowUpPolicy(tx, { schoolId: preparation.schoolId, coachId: null })).notifyCoordinationOnOverdue);
    if (coordination && preparation?.schoolId) {
      for (const userId of await schoolManagerUserIds(tx, preparation.schoolId)) {
        if (!list.some((item) => item.userId === userId)) list.push({ userId, role: "coordination", href: schoolFollowUpHref(preparation.schoolId) });
      }
    }
    return list;
  }
}

/** Short texts without sensitive content (§7.2): the event's name and the athlete's, nothing about health or goals. */
function noticeText(kind: string, role: "athlete" | "coach" | "coordination", payload: { daysBefore?: number; eventName?: string; dueLocalDate?: string }, athleteName: string) {
  const event = payload.eventName ?? "o evento";
  const days = payload.daysBefore ?? 0;
  const dayWord = days === 1 ? "dia" : "dias";
  switch (kind) {
    case "EVENT_APPROACHING":
      return role === "athlete"
        ? { title: `Faltam ${days} ${dayWord} para ${event}`, body: "Confira a preparação e a logística do evento." }
        : { title: `${athleteName}: faltam ${days} ${dayWord} para o evento`, body: "Confira o planejamento da reta final." };
    case "EVENT_RESULT_MISSING":
      return { title: `Como foi ${event}?`, body: "Registre o resultado quando puder." };
    case "FIRST_ANALYSIS_OVERDUE":
      return { title: `Primeira análise atrasada: evento de ${athleteName}`, body: "O prazo combinado para a primeira análise passou." };
    default:
      return { title: "Lembrete de acompanhamento", body: "Abra para ver os detalhes." };
  }
}
