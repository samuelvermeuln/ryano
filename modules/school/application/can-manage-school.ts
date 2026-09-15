import { z } from "zod";
import { MembershipStatus, SchoolRole } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import type { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

/** School management is granted by an active local membership, never global ADMIN. */
export class CanManageSchool {
  constructor(
    private readonly memberships: Pick<SchoolMembershipRepository, "findActiveBySchoolAndUser" | "findRoles">,
  ) {}

  async execute(actorUserId: string | null, schoolId: string): Promise<boolean> {
    const actor = idSchema.safeParse(actorUserId);
    const school = idSchema.safeParse(schoolId);
    if (!actor.success || !school.success) return false;

    const membership = await this.memberships.findActiveBySchoolAndUser(school.data, actor.data);
    if (!membership || membership.status !== MembershipStatus.ACTIVE
      || membership.endedAt !== null || membership.schoolId !== school.data || membership.userId !== actor.data) {
      return false;
    }

    const roles = await this.memberships.findRoles(membership.id);
    return roles.some(({ membershipId, role }) => membershipId === membership.id
      && (role === SchoolRole.OWNER || role === SchoolRole.ADMIN));
  }

  async assert(actorUserId: string | null, schoolId: string): Promise<void> {
    if (!idSchema.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!await this.execute(actorUserId, schoolId)) {
      throw new SchoolError("FORBIDDEN", "Você não pode gerenciar esta escola.", 403);
    }
  }
}
