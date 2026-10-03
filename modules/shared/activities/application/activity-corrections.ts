/**
 * SAM-73 — recording and reading corrections of an activity (§18.3).
 *
 * Who corrects: the athlete who owns the activity, or a coach who can read
 * the athlete's current data (the same gate the hub uses). The provider's
 * row is never updated: a correction is a new row with the original value,
 * the corrected one, the reason and the author. A correction of a linked
 * execution recomputes its compliance (the algorithm version stays on the
 * record).
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { CanReadAthleteCurrentData } from "@/modules/school/application/can-read-athlete-current-data";
import { triggerComplianceCalculation } from "@/modules/school/application/calculate-workout-compliance";
import { SchoolError } from "@/modules/school/domain/errors";
import { loadExecutionLaps } from "@/modules/strava/application/activities/activity-visual-with-split-fallback";
import {
  correctionInputSchema, POOL_LENGTHS, recomputePoolDistance, type CorrectableField, type CorrectionRow,
} from "../domain/activity-correction";

const MATCHED = ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] as const;

export async function listActivityCorrections(db: PrismaClient, activityId: string): Promise<CorrectionRow[]> {
  const rows = await db.activityCorrection.findMany({
    where: { activityId },
    orderBy: { createdAt: "desc" },
    select: { field: true, originalValue: true, correctedValue: true, reason: true, method: true, authorRole: true, createdAt: true, author: { select: { name: true } } },
  });
  return rows.map((row) => ({
    field: row.field as CorrectableField,
    originalValue: row.originalValue === null ? null : Number(row.originalValue),
    correctedValue: Number(row.correctedValue),
    reason: row.method ? `${row.reason} (${row.method})` : row.reason,
    authorName: row.author?.name ?? null,
    authorRole: row.authorRole as "athlete" | "coach",
    createdAt: row.createdAt,
  }));
}

const poolSchema = z.strictObject({
  field: z.literal("poolLengthMeters"),
  originalPoolLength: z.number().positive(),
  correctedValue: z.number().positive(),
  reason: z.string().trim().min(3, "Diga por que o valor está sendo corrigido.").max(1000),
});

export class RecordActivityCorrection {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  private async role(actorUserId: string, activity: { userId: string; workoutExecutions: Array<{ assignment: { schoolId: string | null } | null }> }) {
    if (activity.userId === actorUserId) return "athlete" as const;
    const coach = await this.db.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
    if (!coach) return null;
    const schoolIds = [...new Set(activity.workoutExecutions.map((execution) => execution.assignment?.schoolId ?? null))];
    const gate = new CanReadAthleteCurrentData(this.db, this.clock);
    for (const schoolId of schoolIds.length > 0 ? schoolIds : [null]) {
      if (await gate.execute(actorUserId, { athleteId: activity.userId, schoolId })) return "coach" as const;
    }
    return null;
  }

  async execute(actorUserId: string | null, activityId: string, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const activity = await this.db.activity.findUnique({
      where: { id: activityId },
      select: {
        id: true, userId: true, distanceMeters: true, movingSeconds: true, sportType: true,
        workoutExecutions: { where: { matchStatus: { in: [...MATCHED] } }, select: { id: true, assignment: { select: { schoolId: true } } } },
      },
    });
    if (!activity) throw new SchoolError("ACTIVITY_NOT_FOUND", "Atividade não encontrada.", 404);
    const role = await this.role(actorUserId, activity);
    if (!role) throw new SchoolError("ACTIVITY_NOT_FOUND", "Atividade não encontrada.", 404);
    const now = this.clock();
    const corrections = await listActivityCorrections(this.db, activity.id);
    const latest = (field: CorrectableField) => corrections.find((row) => row.field === field)?.correctedValue ?? null;

    const body = raw as { field?: string };
    const rows: Prisma.ActivityCorrectionCreateManyInput[] = [];
    if (body?.field === "poolLengthMeters") {
      // Pool correction: the pool length row and the recomputed distance, both explicit (§18.3).
      const input = poolSchema.parse(raw);
      if (activity.sportType !== "swim") throw new SchoolError("VALIDATION_ERROR", "Comprimento de piscina só se aplica a natação em piscina.", 422);
      if (!POOL_LENGTHS.some((option) => option.value === input.correctedValue)) throw new SchoolError("VALIDATION_ERROR", "Comprimento de piscina não reconhecido.", 422);
      const currentDistance = latest("distanceMeters") ?? activity.distanceMeters;
      if (currentDistance === null) throw new SchoolError("VALIDATION_ERROR", "A atividade não tem distância para recalcular.", 422);
      const recomputed = recomputePoolDistance(currentDistance, input.originalPoolLength, input.correctedValue);
      rows.push({ id: randomUUID(), activityId: activity.id, field: "poolLengthMeters", originalValue: input.originalPoolLength, correctedValue: input.correctedValue, reason: input.reason, authorUserId: actorUserId, authorRole: role, createdAt: now });
      rows.push({ id: randomUUID(), activityId: activity.id, field: "distanceMeters", originalValue: currentDistance, correctedValue: recomputed.distanceMeters, reason: input.reason, method: recomputed.method, authorUserId: actorUserId, authorRole: role, createdAt: new Date(now.getTime() + 1) });
    } else {
      const input = correctionInputSchema.parse(raw);
      if (input.field === "poolLengthMeters") throw new SchoolError("VALIDATION_ERROR", "Informe o comprimento original da piscina.", 422);
      const original = input.field === "distanceMeters" ? activity.distanceMeters : activity.movingSeconds;
      rows.push({ id: randomUUID(), activityId: activity.id, field: input.field, originalValue: latest(input.field) ?? original, correctedValue: input.correctedValue, reason: input.reason, authorUserId: actorUserId, authorRole: role, createdAt: now });
    }
    await this.db.activityCorrection.createMany({ data: rows });
    // The linked execution is Ryvano's own record of the session: it follows the corrected value, and its
    // compliance is recomputed (algorithm version on the record). The Activity row keeps the provider's original.
    const distanceRow = rows.find((row) => row.field === "distanceMeters");
    const movingRow = rows.find((row) => row.field === "movingSeconds");
    for (const execution of activity.workoutExecutions) {
      await this.db.workoutExecution.update({
        where: { id: execution.id },
        data: {
          ...(distanceRow ? { distanceMeters: Number(distanceRow.correctedValue) } : {}),
          ...(movingRow ? { movingSeconds: Math.round(Number(movingRow.correctedValue)) } : {}),
        },
      });
      await triggerComplianceCalculation(this.db, execution.id, this.clock, loadExecutionLaps);
    }
    return { recorded: rows.length, role };
  }
}
