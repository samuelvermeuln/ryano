/**
 * SAM-72 — DEVIATION_DETECTED (§7.1, §27.2): raised to the responsible coach
 * when the main series' intensity adherence falls below the threshold THE
 * ORGANIZATION configured (`FollowUpPolicy.deviationAdherenceBelowPct`).
 * No threshold, no notice: there is no universal number. Low coverage never
 * triggers it — a deviation is only claimed on what was measured.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { NotificationService } from "@/modules/shared/notifications";
import { CanReadAthleteCurrentData } from "./can-read-athlete-current-data";

type Db = PrismaClient | Prisma.TransactionClient;

export async function raiseDeviationIfConfigured(db: Db, now: Date, assignmentId: string, adherencePct: number, coveragePct: number | null) {
  const assignment = await db.workoutAssignment.findUnique({
    where: { id: assignmentId },
    select: { athleteId: true, schoolId: true, coachId: true, coach: { select: { userId: true } }, athlete: { select: { name: true } }, workout: { select: { title: true } } },
  });
  if (!assignment?.coach || !assignment.coachId) return;
  const policy = assignment.schoolId
    ? await db.followUpPolicy.findUnique({ where: { schoolId: assignment.schoolId }, select: { deviationAdherenceBelowPct: true } })
    : await db.followUpPolicy.findUnique({ where: { coachId: assignment.coachId }, select: { deviationAdherenceBelowPct: true } });
  const threshold = policy?.deviationAdherenceBelowPct ?? null;
  if (threshold === null || adherencePct >= threshold) return;
  if (!await new CanReadAthleteCurrentData(db as PrismaClient, () => now).execute(assignment.coach.userId, { athleteId: assignment.athleteId, schoolId: assignment.schoolId })) return;
  const name = assignment.athlete.name ?? "atleta";
  const base = assignment.schoolId ? `/professor/${assignment.schoolId}` : "/professor/independente";
  await new NotificationService(db, () => now).notify({
    userId: assignment.coach.userId,
    kind: "DEVIATION_DETECTED",
    title: `Desvio de intensidade: ${name}`,
    body: `${assignment.workout?.title ?? "Sessão"}: aderência ${adherencePct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% (abaixo de ${threshold}%)${coveragePct !== null ? `, cobertura ${coveragePct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : ""}.`,
    href: `${base}/atletas/${assignment.athleteId}/treinos/${assignmentId}#blocos`,
    dedupeKey: `deviation:${assignmentId}`,
  });
}
