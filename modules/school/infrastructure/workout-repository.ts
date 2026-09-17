import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutStatus } from "../domain/enums";
import { workoutSchema, type Workout } from "../domain/workout";
import { workoutBlockSchema, type WorkoutBlock } from "../domain/workout-block";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const page = z.strictObject({ limit: z.number().int().min(1).max(100).default(20), cursor: z.string().min(1).max(2048).optional() });
const cursor = z.strictObject({ id });
type PageOptions = { limit?: number; cursor?: string };

/** Prescriptions remain queryable after their originating template is changed or archived. */
export class WorkoutRepository {
  constructor(private readonly db: Pick<PrismaClient, "workout" | "workoutBlock">) {}

  async create(workout: Workout): Promise<Workout> {
    const row = await this.db.workout.create({ data: workoutSchema.parse(workout) });
    return workoutSchema.parse(row);
  }

  async findById(value: string): Promise<Workout | null> {
    const row = await this.db.workout.findUnique({ where: { id: id.parse(value) } });
    return row ? workoutSchema.parse(row) : null;
  }

  async listByOriginSchool(schoolId: string, options: PageOptions = {}) {
    return this.list({ originSchoolId: id.parse(schoolId) }, options);
  }

  async listByAuthorCoach(coachId: string, options: PageOptions = {}) {
    return this.list({ authorCoachId: id.parse(coachId) }, options);
  }

  async listByTemplate(templateId: string, options: PageOptions = {}) {
    return this.list({ templateId: id.parse(templateId) }, options);
  }

  async listByStatus(status: WorkoutStatus, options: PageOptions = {}) {
    return this.list({ status: z.enum(WorkoutStatus).parse(status) }, options);
  }

  async createBlock(block: WorkoutBlock): Promise<WorkoutBlock> {
    const value = workoutBlockSchema.parse(block);
    const row = await this.db.workoutBlock.create({ data: {
      ...value,
      targetPayload: value.targetPayload === null ? Prisma.JsonNull : value.targetPayload,
      restPayload: value.restPayload === null ? Prisma.JsonNull : value.restPayload,
    } });
    return workoutBlockSchema.parse(row);
  }

  async listBlocks(workoutId: string): Promise<WorkoutBlock[]> {
    const rows = await this.db.workoutBlock.findMany({ where: { workoutId: id.parse(workoutId) }, orderBy: { position: "asc" } });
    return rows.map((row) => workoutBlockSchema.parse(row));
  }

  private async list(scope: { originSchoolId?: string; authorCoachId?: string; templateId?: string; status?: WorkoutStatus }, options: PageOptions) {
    const { limit, cursor: encoded } = page.parse(options);
    const after = encoded ? cursor.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))) : null;
    const rows = await this.db.workout.findMany({
      where: { ...scope, ...(after ? { id: { gt: after.id } } : {}) },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map((row) => workoutSchema.parse(row));
    const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ id: last.id })).toString("base64url") : null };
  }
}
