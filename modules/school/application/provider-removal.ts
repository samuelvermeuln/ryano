/**
 * SAM-62 — §17.3 "exclusão no provedor" (policy in ADR-010).
 *
 * When the athlete deletes an activity at the provider, the provider module
 * must delete its copy of the activity. The prescription side does not vanish
 * with it: the execution linked to a session keeps its snapshot, its review
 * and its feedback, and is marked "removida no provedor" for audit. Provider-
 * agnostic: any provider module calls this in the same transaction as its
 * delete, before deleting.
 */
import type { PrismaClient } from "@prisma/client";
import { executionSourceVariants } from "./match-persisted-activity";

export function markExecutionsRemovedAtProvider(
  db: Pick<PrismaClient, "workoutExecution">,
  activity: { userId: string; provider: string; externalId: string },
  now: Date,
) {
  return db.workoutExecution.updateMany({
    where: {
      athleteId: activity.userId,
      externalId: activity.externalId,
      source: { in: executionSourceVariants(activity.provider) },
      providerRemovedAt: null,
    },
    data: { providerRemovedAt: now },
  });
}
