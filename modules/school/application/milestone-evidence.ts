/**
 * SAM-71 — §8.3: linked evidence (an execution or the athlete's report of a
 * session tagged with a milestone) moves the milestone to EVIDENCE_RECEIVED
 * and tells the responsible coach. It never decides the milestone: that is
 * the coach's review. Called inside the transaction that created the
 * evidence, wherever an execution or a report is born.
 */
import type { Prisma } from "@prisma/client";

import { NotificationService } from "@/modules/shared/notifications";
import { statusAfterEvidence, type MilestoneStatus } from "../domain/preparation-plan";
import { loadFollowUpPolicy } from "./follow-up-reminders";

type Tx = Prisma.TransactionClient;
export function coachEventHref(schoolId: string | null, athleteId: string, participationId: string) {
  return `/professor/${schoolId ?? "independente"}/atletas/${athleteId}/eventos/${participationId}`;
}

/** Linked execution or the athlete's report: the milestones of this session that waited for it move on, and the coach is told. */
export async function recordMilestoneEvidence(tx: Tx, assignmentId: string, now: Date) {
  const links = await tx.workoutAssignmentEventLink.findMany({
    where: { assignmentId, milestoneId: { not: null } },
    select: {
      milestone: {
        select: {
          id: true, title: true, status: true,
          preparation: { select: { coachId: true, schoolId: true, coach: { select: { userId: true } }, participation: { select: { id: true, athleteId: true } } } },
        },
      },
    },
  });
  for (const { milestone } of links) {
    if (!milestone) continue;
    const next = statusAfterEvidence(milestone.status as MilestoneStatus);
    if (next === milestone.status) continue;
    const updated = await tx.preparationMilestone.updateMany({
      where: { id: milestone.id, status: milestone.status },
      data: { status: next, evidenceAt: now, version: { increment: 1 }, updatedAt: now },
    });
    const { preparation } = milestone;
    if (updated.count === 0 || !preparation.coach) continue;
    const policy = await loadFollowUpPolicy(tx, { schoolId: preparation.schoolId, coachId: preparation.schoolId ? null : preparation.coachId });
    if (!policy.milestoneNotifyCoach) continue;
    await new NotificationService(tx, () => now).notify({
      userId: preparation.coach.userId,
      kind: "MILESTONE_EVIDENCE_RECEIVED",
      title: `Evidência recebida: ${milestone.title}`,
      body: "Confira e decida se o marco foi atingido.",
      href: coachEventHref(preparation.schoolId, preparation.participation.athleteId, preparation.participation.id),
      dedupeKey: `milestone-evidence:${milestone.id}`,
    });
  }
}

