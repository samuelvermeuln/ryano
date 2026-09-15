import type { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";

/** Member management shares the active local OWNER/ADMIN gate.
 * Target-specific protections (such as the last OWNER) remain in the use cases.
 */
export class CanManageMembers {
  private readonly canManageSchool: CanManageSchool;

  constructor(
    memberships: Pick<SchoolMembershipRepository, "findActiveBySchoolAndUser" | "findRoles">,
  ) {
    this.canManageSchool = new CanManageSchool(memberships);
  }

  async execute(actorUserId: string | null, schoolId: string): Promise<boolean> {
    return this.canManageSchool.execute(actorUserId, schoolId);
  }

  async assert(actorUserId: string | null, schoolId: string): Promise<void> {
    await this.canManageSchool.assert(actorUserId, schoolId);
  }
}
