import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { workoutAssignmentSchema, workoutAssignmentHistorySchema, type WorkoutAssignment, type WorkoutAssignmentHistory } from "../domain/workout-assignment";
import type { WorkoutAssignmentStatusRepository } from "../application/update-workout-assignment-status";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const page = z.strictObject({ limit: z.number().int().min(1).max(100).default(20), cursor: z.string().min(1).max(2048).optional() });
const cursor = z.strictObject({ id });
type PageOptions = { limit?: number; cursor?: string };

export class WorkoutAssignmentRepository implements WorkoutAssignmentStatusRepository {
  constructor(private readonly db: Pick<PrismaClient, "workoutAssignment" | "workoutAssignmentHistory">) {}

  async findById(value: string): Promise<WorkoutAssignment | null> {
    const row = await this.db.workoutAssignment.findUnique({ where: { id: id.parse(value) } });
    return row ? workoutAssignmentSchema.parse(row) : null;
  }

  async updateStatus(assignmentId: string, status: WorkoutAssignmentStatus, updatedAt: Date): Promise<WorkoutAssignment> {
    const row = await this.db.workoutAssignment.update({
      where: { id: id.parse(assignmentId) },
      data: { status, updatedAt },
    });
    return workoutAssignmentSchema.parse(row);
  }

  async saveHistory(record: Omit<WorkoutAssignmentHistory, "id" | "createdAt">): Promise<WorkoutAssignmentHistory> {
    const { randomUUID } = await import("node:crypto");
    const now = new Date();
    const payload = record.payload as Prisma.InputJsonValue;
    const row = await this.db.workoutAssignmentHistory.create({
      data: { id: randomUUID(), ...record, payload, createdAt: now },
    });
    return workoutAssignmentHistorySchema.parse(row);
  }

  async listByAthlete(athleteId: string, options: PageOptions = {}) {
    const parsed = id.parse(athleteId);
    const { limit, cursor: encoded } = page.parse(options);
    const after = encoded ? cursor.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))) : null;
    const rows = await this.db.workoutAssignment.findMany({
      where: { athleteId: parsed, ...(after ? { id: { gt: after.id } } : {}) },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map((row) => workoutAssignmentSchema.parse(row));
    const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ id: last.id })).toString("base64url") : null };
  }

  async cancelFutureByCoach(coachId: string, now: Date, actorUserId: string): Promise<number> {
    const { count } = await this.db.workoutAssignment.updateMany({
      where: {
        coachId: id.parse(coachId),
        status: { in: [WorkoutAssignmentStatus.SCHEDULED, WorkoutAssignmentStatus.AVAILABLE, WorkoutAssignmentStatus.RESCHEDULED] },
        scheduledAt: { gte: now },
      },
      data: { status: WorkoutAssignmentStatus.CANCELLED, updatedAt: now },
    });

    if (count > 0) {
      const { randomUUID } = await import("node:crypto");
      const affected = await this.db.workoutAssignment.findMany({
        where: { coachId: id.parse(coachId), status: WorkoutAssignmentStatus.CANCELLED, updatedAt: now },
        select: { id: true },
      });
      const historyPayload: Prisma.InputJsonValue = { reason: "coach_removed", previousStatus: WorkoutAssignmentStatus.SCHEDULED };
      await this.db.workoutAssignmentHistory.createMany({
        data: affected.map((a) => ({
          id: randomUUID(),
          workoutAssignmentId: a.id,
          eventType: "CANCELLED",
          actorUserId: id.parse(actorUserId),
          payload: historyPayload,
          createdAt: now,
        })),
      });
    }

    return count;
  }
}
