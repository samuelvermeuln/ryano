import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { MembershipStatus, SchoolRole } from "../domain/enums";
import { schoolMembershipSchema, transitionSchoolMembership, type SchoolMembership } from "../domain/school-membership";
import { schoolMembershipRoleSchema, type SchoolMembershipRole } from "../domain/school-membership-role";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
const pageSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2048).optional(),
});
const cursorSchema = z.strictObject({ id: idSchema });
type PageOptions = { limit?: number; cursor?: string };

export class SchoolMembershipRepository {
  // Prisma's transaction client exposes the same delegates; the use case owns commit/rollback.
  constructor(private readonly db: Pick<PrismaClient, "schoolMembership" | "schoolMembershipRole">) {}

  async create(membership: SchoolMembership): Promise<SchoolMembership> {
    return this.db.schoolMembership.create({ data: schoolMembershipSchema.parse(membership) });
  }

  async findById(id: string): Promise<SchoolMembership | null> {
    return this.db.schoolMembership.findUnique({ where: { id: idSchema.parse(id) } });
  }

  async findActiveBySchoolAndUser(schoolId: string, userId: string): Promise<SchoolMembership | null> {
    return this.db.schoolMembership.findFirst({
      where: { schoolId: idSchema.parse(schoolId), userId: idSchema.parse(userId), status: MembershipStatus.ACTIVE },
    });
  }

  async listBySchool(schoolId: string, options: PageOptions = {}) {
    return this.listPeriods({ schoolId: idSchema.parse(schoolId) }, options);
  }

  async listByUser(userId: string, options: PageOptions = {}) {
    return this.listPeriods({ userId: idSchema.parse(userId) }, options);
  }

  private async listPeriods(scope: { schoolId: string } | { userId: string }, options: PageOptions) {
    const { limit, cursor } = pageSchema.parse(options);
    const after = cursor ? cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))) : null;
    const rows = await this.db.schoolMembership.findMany({
      where: { ...scope, ...(after ? { id: { gt: after.id } } : {}) },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const items: SchoolMembership[] = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > limit && last
        ? Buffer.from(JSON.stringify({ id: last.id })).toString("base64url")
        : null,
    };
  }

  async updateStatus(id: string, status: MembershipStatus, now: Date): Promise<SchoolMembership | null> {
    const current = await this.findById(id);
    if (!current) return null;
    const next = transitionSchoolMembership(current, status, now);
    return this.db.schoolMembership.update({
      // Fail with Prisma P2025 if another writer has changed this period after the read.
      where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
      data: { status: next.status, startedAt: next.startedAt, endedAt: next.endedAt, updatedAt: next.updatedAt },
    });
  }

  async addRole(role: SchoolMembershipRole): Promise<SchoolMembershipRole> {
    return this.db.schoolMembershipRole.create({ data: schoolMembershipRoleSchema.parse(role) });
  }

  async removeRole(membershipId: string, role: SchoolRole): Promise<boolean> {
    const result = await this.db.schoolMembershipRole.deleteMany({
      where: { membershipId: idSchema.parse(membershipId), role: z.enum(SchoolRole).parse(role) },
    });
    return result.count > 0;
  }

  async findRoles(membershipId: string): Promise<SchoolMembershipRole[]> {
    return this.db.schoolMembershipRole.findMany({
      where: { membershipId: idSchema.parse(membershipId) },
      orderBy: { id: "asc" },
    });
  }
}
