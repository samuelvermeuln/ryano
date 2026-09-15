import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { MembershipStatus } from "../domain/enums";
import { schoolAthleteMembershipSchema, transitionSchoolAthleteMembership, type SchoolAthleteMembership } from "../domain/school-athlete-membership";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const page = z.strictObject({ limit: z.number().int().min(1).max(100).default(20), cursor: z.string().min(1).max(2048).optional() });
const cursor = z.strictObject({ id });
type PageOptions = { limit?: number; cursor?: string };

export class SchoolAthleteMembershipRepository {
  constructor(private readonly db: Pick<PrismaClient, "schoolAthleteMembership">) {}

  async create(membership: SchoolAthleteMembership): Promise<SchoolAthleteMembership> {
    const row = await this.db.schoolAthleteMembership.create({ data: schoolAthleteMembershipSchema.parse(membership) });
    return schoolAthleteMembershipSchema.parse(row);
  }

  async findById(value: string): Promise<SchoolAthleteMembership | null> {
    const row = await this.db.schoolAthleteMembership.findUnique({ where: { id: id.parse(value) } });
    return row ? schoolAthleteMembershipSchema.parse(row) : null;
  }

  async findActiveBySchoolAndAthlete(schoolId: string, athleteId: string): Promise<SchoolAthleteMembership | null> {
    const row = await this.db.schoolAthleteMembership.findFirst({ where: { schoolId: id.parse(schoolId), athleteId: id.parse(athleteId), status: MembershipStatus.ACTIVE } });
    return row ? schoolAthleteMembershipSchema.parse(row) : null;
  }

  async listBySchool(schoolId: string, options: PageOptions = {}) { return this.list({ schoolId: id.parse(schoolId) }, options); }
  async listByAthlete(athleteId: string, options: PageOptions = {}) { return this.list({ athleteId: id.parse(athleteId) }, options); }

  private async list(scope: { schoolId: string } | { athleteId: string }, options: PageOptions) {
    const { limit, cursor: encoded } = page.parse(options);
    const after = encoded ? cursor.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))) : null;
    const rows = await this.db.schoolAthleteMembership.findMany({ where: { ...scope, ...(after ? { id: { gt: after.id } } : {}) }, orderBy: { id: "asc" }, take: limit + 1 });
    const items = rows.slice(0, limit).map((row) => schoolAthleteMembershipSchema.parse(row));
    const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ id: last.id })).toString("base64url") : null };
  }

  async updateStatus(value: string, status: MembershipStatus, now: Date, actorId?: string): Promise<SchoolAthleteMembership | null> {
    const current = await this.findById(value);
    if (!current) return null;
    const next = transitionSchoolAthleteMembership(current, status, now, actorId);
    const row = await this.db.schoolAthleteMembership.update({
      where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
      data: { status: next.status, startedAt: next.startedAt, endedAt: next.endedAt, approvedBy: next.approvedBy, approvedAt: next.approvedAt, rejectedBy: next.rejectedBy, rejectedAt: next.rejectedAt, revokedBy: next.revokedBy, revokedAt: next.revokedAt, updatedAt: next.updatedAt },
    });
    return schoolAthleteMembershipSchema.parse(row);
  }
}
