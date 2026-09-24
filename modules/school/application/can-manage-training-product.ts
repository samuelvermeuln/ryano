import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import type { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export interface AuthorizedCoach {
  coachId: string;
}

/**
 * TM018 — Reusable authorization guard for the coach studio (RF-101).
 *
 * "Authorized professor" means:
 *   1. The actor has an ACTIVE `CoachProfile` — the same
 *      `COACH_PROFILE_NOT_FOUND` / `COACH_INACTIVE` checks already used by
 *      every other coach-authoring use case in this module (see
 *      create-workout-template.ts, update-workout-template.ts,
 *      archive-workout-template.ts, …).
 *   2. When the product's commercial owner is a school (`ownerSchoolId` set),
 *      the actor must ALSO be OWNER/ADMIN of *that* school — reusing
 *      `CanManageSchool` exactly the way `CanManageMembers` already does,
 *      instead of inventing a second authorization concept (design §4,
 *      "Autoria de produto reusa exatamente as mesmas checagens de
 *      CoachSchoolMembership/OWNER-ADMIN já usadas pelo resto do módulo
 *      escola"). Holding a merely-active `CoachSchoolMembership` at the
 *      school is NOT enough by itself: publishing a product commercially
 *      under the school's name is a business decision, the same bar as
 *      managing the school itself — unlike creating a personal
 *      `WorkoutTemplate`, which only needs active membership.
 *
 * Coach-owned products (`ownerSchoolId == null`) need no school check at all
 * — the CoachProfile check alone is sufficient (RF-101, "professor
 * independente").
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
   * Resolves and asserts the acting coach; when `ownerSchoolId` is given,
   * also asserts the actor is OWNER/ADMIN of that school. Throws
   * `SchoolError` (401/404/409/403) on any failure — never returns false.
   */
  async assertAuthorCoach(actorUserId: string | null, ownerSchoolId: string | null): Promise<AuthorizedCoach> {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);

    const coach = await this.db.coachProfile.findUnique({
      where: { userId: actor.data },
      select: { id: true, status: true },
    });
    if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
    if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);

    if (ownerSchoolId) {
      await this.canManageSchool.assert(actorUserId, ownerSchoolId);
    }

    return { coachId: coach.id };
  }
}
