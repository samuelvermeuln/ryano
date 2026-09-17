import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TemplateStatus, WorkoutOwnerType } from "../domain/enums";
import { workoutTemplateSchema, type WorkoutTemplate } from "../domain/workout-template";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const page = z.strictObject({ limit: z.number().int().min(1).max(100).default(20), cursor: z.string().min(1).max(2048).optional() });
const cursor = z.strictObject({ id });
type PageOptions = { limit?: number; cursor?: string };

/** Persists reusable templates without taking ownership of caller transactions. */
export class WorkoutTemplateRepository {
  constructor(private readonly db: Pick<PrismaClient, "workoutTemplate">) {}

  async create(template: WorkoutTemplate): Promise<WorkoutTemplate> {
    const row = await this.db.workoutTemplate.create({ data: workoutTemplateSchema.parse(template) });
    return workoutTemplateSchema.parse(row);
  }

  async findById(value: string): Promise<WorkoutTemplate | null> {
    const row = await this.db.workoutTemplate.findUnique({ where: { id: id.parse(value) } });
    return row ? workoutTemplateSchema.parse(row) : null;
  }

  async listByOwner(ownerType: WorkoutOwnerType, ownerId: string, options: PageOptions = {}) {
    return this.list({ ownerType: z.enum(WorkoutOwnerType).parse(ownerType), ownerId: id.parse(ownerId) }, options);
  }

  async listActiveByOwner(ownerType: WorkoutOwnerType, ownerId: string, options: PageOptions = {}) {
    return this.list({ ownerType: z.enum(WorkoutOwnerType).parse(ownerType), ownerId: id.parse(ownerId), status: TemplateStatus.ACTIVE }, options);
  }

  private async list(scope: { ownerType: WorkoutOwnerType; ownerId: string; status?: TemplateStatus }, options: PageOptions) {
    const { limit, cursor: encoded } = page.parse(options);
    const after = encoded ? cursor.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))) : null;
    const rows = await this.db.workoutTemplate.findMany({
      where: { ...scope, ...(after ? { id: { gt: after.id } } : {}) },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map((row) => workoutTemplateSchema.parse(row));
    const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ id: last.id })).toString("base64url") : null };
  }
}
