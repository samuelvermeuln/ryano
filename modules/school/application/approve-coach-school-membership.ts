import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { CoachSchoolMembershipRepository } from "../infrastructure/coach-school-membership-repository";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { NotificationService, UserNotificationKind } from "@/modules/shared/notifications";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

export class ApproveCoachSchoolMembership {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, membershipId: string) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const schoolTarget = idSchema.safeParse(schoolId);
    if (!schoolTarget.success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const membershipTarget = idSchema.safeParse(membershipId);
    if (!membershipTarget.success) throw this.notFound();

    try {
      return await this.db.$transaction(async (tx) => {
        const school = await tx.school.findUnique({
          where: { id: schoolTarget.data }, select: { id: true, status: true, name: true },
        });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        await new CanManageMembers(new SchoolMembershipRepository(tx)).assert(actor.data, school.id);
        if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);

        const memberships = new CoachSchoolMembershipRepository(tx);
        const membership = await memberships.findById(membershipTarget.data);
        if (!membership || membership.schoolId !== school.id) throw this.notFound();
        // The repository owns the temporal transition and optimistic concurrency check.
        const now = this.clock();
        const approved = await memberships.updateStatus(membership.id, "ACTIVE", now);
        if (!approved) throw this.notFound();

        // SAM-29 — the coach's current athletes elsewhere (independent or at
        // another school) can follow them here in one click: the link opens the
        // school's modal with this coach pre-selected (SAM-24 preferredCoachId).
        // `NOT: { schoolId }` would drop independent links (NULL never equals), so
        // the two cases are spelled out.
        const followers = await tx.coachAthleteAssignment.findMany({
          where: { coachId: membership.coachId, status: "ACTIVE", OR: [{ schoolId: null }, { schoolId: { not: school.id } }] },
          select: { athleteId: true },
        });
        if (followers.length > 0) {
          const coach = await tx.coachProfile.findUnique({ where: { id: membership.coachId }, select: { displayName: true } });
          const coachName = coach?.displayName ?? "Seu professor";
          await new NotificationService(tx, () => now).notifyMany(followers.map((row) => row.athleteId), {
            kind: UserNotificationKind.COACH_JOINED_SCHOOL,
            title: `${coachName} agora também atende na ${school.name ?? "escola"}`,
            body: "Quer seguir seu professor? Peça vínculo nessa escola com ele já selecionado como professor preferido.",
            href: `/app/escola?school=${school.id}&coach=${membership.coachId}`,
            payload: { coachId: membership.coachId, schoolId: school.id },
          });
        }
        return approved;
      // The follower fan-out adds round trips; a remote database does not fit Prisma's 5s default.
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError
        && ["P2002", "P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_CONFLICT", "O vínculo do professor foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", "Vínculo do professor não encontrado.", 404);
  }
}
