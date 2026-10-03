/**
 * SAM-62 — §17.3 "atividade extra": an imported activity that matches no
 * prescribed session stays visible (calendar and authorized history) and the
 * athlete's current coaches get a routine UNPLANNED_ACTIVITY notice, once per
 * activity. Old activities arriving in a backfill do not notify.
 */
import type { PrismaClient } from "@prisma/client";
import { NotificationService } from "@/modules/shared/notifications";

const RECENT_DAYS = 7;

export async function notifyUnplannedActivity(
  db: PrismaClient,
  activity: { id: string; userId: string; sportType: string; startedAt: Date },
  now: Date,
) {
  if (now.getTime() - activity.startedAt.getTime() > RECENT_DAYS * 86_400_000) return 0;
  const links = await db.coachAthleteAssignment.findMany({
    where: { athleteId: activity.userId, status: "ACTIVE", endedAt: null },
    select: { schoolId: true, coach: { select: { userId: true } }, athlete: { select: { name: true } } },
  });
  if (links.length === 0) return 0;
  const name = links[0]!.athlete.name ?? "Seu aluno";
  const service = new NotificationService(db, () => now);
  for (const link of links) {
    await service.notify({
      userId: link.coach.userId,
      kind: "UNPLANNED_ACTIVITY",
      title: `${name} registrou uma atividade fora do plano`,
      body: "A atividade fica no histórico. Se ela substitui uma sessão, associe no detalhe do treino — nada muda sozinho.",
      href: `/professor/${link.schoolId ?? "independente"}/atletas/${activity.userId}/atividades/${activity.id}`,
      dedupeKey: `unplanned:${activity.id}`,
    });
  }
  return links.length;
}
