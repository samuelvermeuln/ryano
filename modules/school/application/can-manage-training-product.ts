import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import type { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export interface AuthorizedCoach {
  /**
   * The acting `CoachProfile`, or `null` when the actor was authorized purely
   * as a manager of the owning school (SAM-9). Callers that need "is this
   * actually *my* coach-owned product" already guard on
   * `product.coachId && product.coachId !== coachId`, which correctly refuses
   * a school manager on a coach-owned product.
   */
  coachId: string | null;
}

/**
 * TM018 — Reusable authorization guard for product authoring (RF-101).
 *
 * Authority is decided by WHO OWNS the product, because ownership is what
 * decides where the revenue lands (`SellerLedgerEntry` via the checkout's
 * frozen `offerSnapshot`):
 *
 *   - **Coach-owned** (`ownerSchoolId == null`): the actor needs an ACTIVE
 *     `CoachProfile` — the same `COACH_PROFILE_NOT_FOUND` / `COACH_INACTIVE`
 *     checks used by every other coach-authoring use case in this module (see
 *     create-workout-template.ts, update-workout-template.ts, …). No school
 *     check at all (RF-101, "professor independente").
 *   - **School-owned** (`ownerSchoolId` set): the actor must be OWNER/ADMIN of
 *     *that* school, via `CanManageSchool` — reusing the module's existing
 *     RBAC exactly the way `CanManageMembers` does, instead of inventing a
 *     second authorization concept (design §4). A merely-active
 *     `CoachSchoolMembership` is NOT enough: selling under the school's name
 *     is a business decision, the same bar as managing the school itself.
 *
 * SAM-9 — a `CoachProfile` is NOT required on the school-owned path. The
 * school is a first-class seller (`SellerType.SCHOOL`), so its OWNER/ADMIN can
 * author and sell in the school's name without being a professor, and without
 * inventing a fictitious coach to satisfy an older rule. Requiring a profile
 * here used to lock out exactly the person with the most commercial authority
 * over the school. A coach who *does* have a profile still gets their
 * `coachId` back, so nothing on the professor path changes; an existing but
 * SUSPENDED profile is still rejected, so suspension is never laundered
 * through a management role.
 */
export class CanManageTrainingProduct {
  private readonly canManageSchool: CanManageSchool;

  constructor(
    private readonly db: Pick<PrismaClient, "coachProfile">,
    memberships: Pick<SchoolMembershipRepository, "findActiveBySchoolAndUser" | "findRoles">,
  ) {
    this.canManageSchool = new CanManageSchool(memberships);
  }

  /**
   * Resolves and asserts the actor's authority over a product owned by
   * `ownerSchoolId` (school-owned) or by their own `CoachProfile`
   * (coach-owned, `ownerSchoolId == null`). Throws `SchoolError`
   * (401/404/409/403) on any failure — never returns false.
   */
  async assertAuthorCoach(actorUserId: string | null, ownerSchoolId: string | null): Promise<AuthorizedCoach> {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);

    const coach = await this.db.coachProfile.findUnique({
      where: { userId: actor.data },
      select: { id: true, status: true },
    });

    // SAM-9 — a school-owned product's authority comes from managing THAT
    // school, so a manager with no CoachProfile is authorized here while a
    // coach who merely holds a profile still is not. A profile that exists
    // must still be ACTIVE: a suspended coach does not regain product powers
    // by also being a school manager.
    if (ownerSchoolId) {
      if (coach && coach.status !== "ACTIVE") {
        throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);
      }
      await this.canManageSchool.assert(actorUserId, ownerSchoolId);
      return { coachId: coach?.id ?? null };
    }

    if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
    if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);

    return { coachId: coach.id };
  }
}
