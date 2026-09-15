import { SchoolRole } from "../domain/enums";
import type { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";

/** Deactivation requires an active local OWNER; ADMIN alone is insufficient. */
export class CanDeactivateSchool {
  private readonly canManageSchool: CanManageSchool;

  constructor(
    memberships: Pick<SchoolMembershipRepository, "findActiveBySchoolAndUser" | "findRoles">,
  ) {
    // Narrow the roles while retaining the shared identity, period and scope checks.
    this.canManageSchool = new CanManageSchool({
      findActiveBySchoolAndUser: (schoolId, userId) => memberships.findActiveBySchoolAndUser(schoolId, userId),
      findRoles: async (membershipId) => (await memberships.findRoles(membershipId))
        .filter(({ role }) => role === SchoolRole.OWNER),
    });
  }

  async execute(actorUserId: string | null, schoolId: string): Promise<boolean> {
    return this.canManageSchool.execute(actorUserId, schoolId);
  }

  async assert(actorUserId: string | null, schoolId: string): Promise<void> {
    await this.canManageSchool.assert(actorUserId, schoolId);
  }
}
