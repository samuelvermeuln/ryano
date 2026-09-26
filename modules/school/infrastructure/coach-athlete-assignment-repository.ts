import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AssignmentStatus } from "../domain/enums";
import {
  coachAthleteAssignmentSchema,
  transitionCoachAthleteAssignment,
  type CoachAthleteAssignment,
} from "../domain/coach-athlete-assignment";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const page = z.strictObject({ limit: z.number().int().min(1).max(100).default(20), cursor: z.string().min(1).max(2048).optional() });
const cursor = z.strictObject({ id });
type PageOptions = { limit?: number; cursor?: string };

/** Persistence adapter for immutable assignment periods; compound transfers belong to use cases. */
export class CoachAthleteAssignmentRepository {
  constructor(private readonly db: Pick<PrismaClient, "coachAthleteAssignment">) {}

  async create(assignment: CoachAthleteAssignment): Promise<CoachAthleteAssignment> {
    const row = await this.db.coachAthleteAssignment.create({ data: coachAthleteAssignmentSchema.parse(assignment) });
    return coachAthleteAssignmentSchema.parse(row);
  }

  async findById(value: string): Promise<CoachAthleteAssignment | null> {
    const row = await this.db.coachAthleteAssignment.findUnique({ where: { id: id.parse(value) } });
    return row ? coachAthleteAssignmentSchema.parse(row) : null;
  }

  async findActivePrimaryBySchoolAndAthlete(schoolId: string, athleteId: string): Promise<CoachAthleteAssignment | null> {
    const row = await this.db.coachAthleteAssignment.findFirst({ where: { schoolId: id.parse(schoolId), athleteId: id.parse(athleteId), status: AssignmentStatus.ACTIVE, isPrimary: true } });
    return row ? coachAthleteAssignmentSchema.parse(row) : null;
  }

  async listBySchool(schoolId: string, options: PageOptions = {}) { return this.list({ schoolId: id.parse(schoolId) }, options); }
  async listByAthlete(athleteId: string, options: PageOptions = {}) { return this.list({ athleteId: id.parse(athleteId) }, options); }
  async listByCoach(coachId: string, options: PageOptions = {}) { return this.list({ coachId: id.parse(coachId) }, options); }

  private async list(scope: { schoolId: string } | { athleteId: string } | { coachId: string }, options: PageOptions) {
    const { limit, cursor: encoded } = page.parse(options);
    const after = encoded ? cursor.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))) : null;
    const rows = await this.db.coachAthleteAssignment.findMany({ where: { ...scope, ...(after ? { id: { gt: after.id } } : {}) }, orderBy: { id: "asc" }, take: limit + 1 });
    const items = rows.slice(0, limit).map((row) => coachAthleteAssignmentSchema.parse(row));
    const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ id: last.id })).toString("base64url") : null };
  }

  async updateStatus(value: string, status: AssignmentStatus, now: Date, actorId?: string): Promise<CoachAthleteAssignment | null> {
    const current = await this.findById(value);
    if (!current) return null;
    const next = transitionCoachAthleteAssignment(current, status, now, actorId);
    const row = await this.db.coachAthleteAssignment.update({
      where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
      data: { status: next.status, startedAt: next.startedAt, endedAt: next.endedAt, assignedBy: next.assignedBy, endedBy: next.endedBy, reason: next.reason, updatedAt: next.updatedAt },
    });
    return coachAthleteAssignmentSchema.parse(row);
  }
}
