import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { MembershipStatus } from "../domain/enums";
import {
  coachSchoolMembershipSchema,
  transitionCoachSchoolMembership,
  type CoachSchoolMembership,
} from "../domain/coach-school-membership";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
const pageSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2048).optional(),
});
const cursorSchema = z.strictObject({ id: idSchema });
type PageOptions = { limit?: number; cursor?: string };

export class CoachSchoolMembershipRepository {
  // Transaction clients share this delegate; the use case owns commit/rollback.
  constructor(private readonly db: Pick<PrismaClient, "coachSchoolMembership">) {}

  async create(membership: CoachSchoolMembership): Promise<CoachSchoolMembership> {
    // Preserve P2002 from the partial ACTIVE index, including concurrent approvals.
    const row = await this.db.coachSchoolMembership.create({ data: coachSchoolMembershipSchema.parse(membership) });
    return coachSchoolMembershipSchema.parse(row);
  }

  async findById(id: string): Promise<CoachSchoolMembership | null> {
    const row = await this.db.coachSchoolMembership.findUnique({ where: { id: idSchema.parse(id) } });
    return row ? coachSchoolMembershipSchema.parse(row) : null;
  }

  async findActiveBySchoolAndCoach(schoolId: string, coachId: string): Promise<CoachSchoolMembership | null> {
    const row = await this.db.coachSchoolMembership.findFirst({
      where: { schoolId: idSchema.parse(schoolId), coachId: idSchema.parse(coachId), status: MembershipStatus.ACTIVE },
    });
    return row ? coachSchoolMembershipSchema.parse(row) : null;
  }

  async listBySchool(schoolId: string, options: PageOptions = {}) {
    return this.listPeriods({ schoolId: idSchema.parse(schoolId) }, options);
  }

  async listByCoach(coachId: string, options: PageOptions = {}) {
    return this.listPeriods({ coachId: idSchema.parse(coachId) }, options);
  }

  private async listPeriods(scope: { schoolId: string } | { coachId: string }, options: PageOptions) {
    const { limit, cursor } = pageSchema.parse(options);
    const after = cursor ? cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))) : null;
    const rows = await this.db.coachSchoolMembership.findMany({
      where: { ...scope, ...(after ? { id: { gt: after.id } } : {}) },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map((row) => coachSchoolMembershipSchema.parse(row));
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > limit && last
        ? Buffer.from(JSON.stringify({ id: last.id })).toString("base64url")
        : null,
    };
  }

  async updateStatus(id: string, status: MembershipStatus, now: Date): Promise<CoachSchoolMembership | null> {
    const current = await this.findById(id);
    if (!current) return null;
    const next = transitionCoachSchoolMembership(current, status, now);
    const row = await this.db.coachSchoolMembership.update({
      // Preserve P2025 if a competing writer changed this period since the read.
      where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
      data: {
        status: next.status,
        decidedAt: next.decidedAt,
        startedAt: next.startedAt,
        endedAt: next.endedAt,
        suspendedAt: next.suspendedAt,
        suspendedBy: next.suspendedBy,
        updatedAt: next.updatedAt,
      },
    });
    return coachSchoolMembershipSchema.parse(row);
  }

  /** Pauses or resumes the link; the transition itself is decided by the entity. */
  async saveSuspension(next: CoachSchoolMembership, expectedUpdatedAt: Date): Promise<CoachSchoolMembership | null> {
    const row = await this.db.coachSchoolMembership.update({
      // Preserve P2025 if a competing writer changed this period since the read.
      where: { id: next.id, status: next.status, updatedAt: expectedUpdatedAt },
      data: {
        suspendedAt: next.suspendedAt,
        suspendedBy: next.suspendedBy,
        updatedAt: next.updatedAt,
      },
    });
    return coachSchoolMembershipSchema.parse(row);
  }
}
