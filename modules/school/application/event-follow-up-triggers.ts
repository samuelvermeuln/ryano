/**
 * SAM-55 — the §7.1 triggers that already have a source in the event core.
 * Each one notifies who is AUTHORIZED (the responsible coach, or the school's
 * coordination when nobody is responsible) — never a random professional,
 * and nobody at all for an athlete without a link (AC03). Notice bodies carry
 * no sensitive content (§7.2): "Novo evento de <aluno>", not the goal or health.
 *
 * Triggers whose source arrives later in the epic use the same helpers:
 * FIRST_ANALYSIS_OVERDUE / EVENT_APPROACHING / EVENT_RESULT_MISSING /
 * SESSION_WITHOUT_RECORD (deadline job, SAM-56), FEEDBACK_PAIN_REPORTED and
 * UNPLANNED_ACTIVITY (feedback/execution, SAM-61), DEVIATION_DETECTED
 * (configured deviation, SAM-63), MILESTONE_* (milestones, SAM-71).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { notifyFollowUp, schoolManagerUserIds } from "./follow-up-tasks";

type Db = PrismaClient | Prisma.TransactionClient;

export const COACH_FOLLOW_UP_HREF = "/professor/acompanhar/pendencias";
export const schoolFollowUpHref = (schoolId: string) => `/escola/${schoolId}/pendencias`;

type PreparationRef = { id: string; coachId: string | null; schoolId: string | null; status: string };

/** Who answers for a preparation now: the responsible's user, or the school's managers (queue). */
async function audienceOf(db: Db, preparation: PreparationRef): Promise<{ users: string[]; queue: boolean }> {
  if (preparation.coachId) {
    const coach = await db.coachProfile.findUnique({ where: { id: preparation.coachId }, select: { userId: true } });
    return { users: coach ? [coach.userId] : [], queue: false };
  }
  if (preparation.schoolId) return { users: await schoolManagerUserIds(db, preparation.schoolId), queue: true };
  return { users: [], queue: false };
}

function hrefFor(preparation: PreparationRef) {
  return (userId: string | null) => (userId === null || preparation.coachId === null) && preparation.schoolId
    ? schoolFollowUpHref(preparation.schoolId)
    : COACH_FOLLOW_UP_HREF;
}

async function athleteName(db: Db, athleteId: string) {
  return (await db.user.findUnique({ where: { id: athleteId }, select: { name: true } }))?.name ?? "atleta";
}

/** EVENT_REGISTERED — the athlete registered an event (§7.1, AC02: once, even if reprocessed). */
export async function onParticipationRegistered(db: Db, now: Date, input: { participationId: string; athleteId: string; actorUserId: string | null; preparation: PreparationRef }) {
  const audience = await audienceOf(db, input.preparation);
  if (audience.users.length === 0 && !audience.queue) return;
  const name = await athleteName(db, input.athleteId);
  await notifyFollowUp(db, now, {
    recipients: audience.users,
    kind: "EVENT_REGISTERED",
    noticeTitle: `Novo evento de ${name}`,
    noticeBody: audience.queue ? "Sem professor responsável: defina quem acompanha." : "Abra para avaliar e decidir o acompanhamento.",
    noticeDedupeKey: `event-registered:${input.participationId}`,
    href: hrefFor(input.preparation),
    task: {
      queue: audience.queue,
      sourceType: "EventPreparation", sourceId: input.preparation.id, athleteId: input.athleteId, schoolId: input.preparation.schoolId,
      title: audience.queue ? `Definir responsável pelo evento de ${name}` : `Avaliar evento de ${name}`,
      dedupeKey: () => `preparation-assess:${input.preparation.id}`,
      reason: "evento registrado", actorUserId: input.actorUserId,
      // Registering is one change: running it again never touches the task (AC02).
      refresh: false,
    },
  });
}

/** EVENT_CHANGED — the athlete changed date/distance/goal; successive changes update one open task (§7.3). */
export async function onParticipationChanged(db: Db, now: Date, input: { participationId: string; athleteId: string; version: number; changedFields: string[]; actorUserId: string; preparation: PreparationRef | null }) {
  if (!input.preparation || input.preparation.status === "CLOSED") return;
  const audience = await audienceOf(db, input.preparation);
  if (audience.users.length === 0 && !audience.queue) return;
  const name = await athleteName(db, input.athleteId);
  await notifyFollowUp(db, now, {
    recipients: audience.users,
    kind: "EVENT_CHANGED",
    noticeTitle: `${name} alterou o evento`,
    noticeBody: "Revise o objetivo e as próximas sessões. O antes/depois está no histórico.",
    noticeDedupeKey: `event-changed:${input.participationId}:v${input.version}`,
    href: hrefFor(input.preparation),
    task: {
      queue: audience.queue,
      sourceType: "AthleteEventParticipation", sourceId: input.participationId, athleteId: input.athleteId, schoolId: input.preparation.schoolId,
      title: `Revisar alteração no evento de ${name}`,
      dedupeKey: () => `participation-review:${input.participationId}`,
      reason: `alterado: ${input.changedFields.join(", ")}`, actorUserId: input.actorUserId,
    },
  });
}

/** EVENT_CANCELLED_OR_POSTPONED / date change — participants and their responsibles (§7.1). */
export async function onEventChanged(db: Db, now: Date, input: { eventId: string; eventName: string; version: number; status: string; actorUserId: string }) {
  const participations = await db.athleteEventParticipation.findMany({
    where: { eventId: input.eventId, status: { not: "CANCELLED" } },
    select: { id: true, athleteId: true, preparation: { select: { id: true, coachId: true, schoolId: true, status: true } } },
  });
  const title = input.status === "CANCELLED" ? `Evento cancelado: ${input.eventName}` : input.status === "POSTPONED" ? `Evento adiado: ${input.eventName}` : `Evento com nova data: ${input.eventName}`;
  for (const participation of participations) {
    const athleteNotice = participation.athleteId === input.actorUserId ? [] : [participation.athleteId];
    const preparation = participation.preparation && participation.preparation.status !== "CLOSED" ? participation.preparation : null;
    const audience = preparation ? await audienceOf(db, preparation) : { users: [], queue: false };
    const name = await athleteName(db, participation.athleteId);
    await notifyFollowUp(db, now, {
      recipients: [...athleteNotice, ...audience.users.filter((userId) => userId !== input.actorUserId)],
      kind: "EVENT_CANCELLED_OR_POSTPONED",
      noticeTitle: title,
      noticeBody: "Confira a participação e o planejamento.",
      noticeDedupeKey: `event-status:${input.eventId}:v${input.version}`,
      href: (userId) => (userId === participation.athleteId ? null : preparation ? hrefFor(preparation)(userId) : null),
      task: preparation && (audience.users.length > 0 || audience.queue)
        ? {
          queue: audience.queue,
          sourceType: "AthleteEventParticipation", sourceId: participation.id, athleteId: participation.athleteId, schoolId: preparation.schoolId,
          title: `Revisar evento alterado de ${name}`,
          dedupeKey: () => `participation-review:${participation.id}`,
          reason: title, actorUserId: input.actorUserId,
        }
        : null,
    });
  }
}

/** PREPARATION_UNASSIGNED — the responsible lost the link; only the school's coordination is told. */
export async function onPreparationUnassigned(db: Db, now: Date, input: { preparationId: string; athleteId: string; schoolId: string | null; transitionKey: string }) {
  if (!input.schoolId) return;
  const managers = await schoolManagerUserIds(db, input.schoolId);
  const name = await athleteName(db, input.athleteId);
  await notifyFollowUp(db, now, {
    recipients: managers,
    kind: "PREPARATION_UNASSIGNED",
    noticeTitle: `Evento de ${name} sem professor responsável`,
    noticeBody: "Defina quem acompanha a preparação.",
    noticeDedupeKey: `preparation-unassigned:${input.preparationId}:${input.transitionKey}`,
    href: () => schoolFollowUpHref(input.schoolId!),
    task: {
      queue: true,
      sourceType: "EventPreparation", sourceId: input.preparationId, athleteId: input.athleteId, schoolId: input.schoolId,
      title: `Definir responsável pelo evento de ${name}`,
      dedupeKey: () => `preparation-assess:${input.preparationId}`,
      reason: "vínculo com o professor encerrado", actorUserId: null,
    },
  });
}
