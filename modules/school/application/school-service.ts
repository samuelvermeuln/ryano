import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { createSchoolDraft, createSchoolDtoSchema } from "../domain/school";
import { MembershipStatus, SchoolRole, WorkoutAssignmentStatus } from "../domain/enums";
import { createSchoolMembership, transitionSchoolMembership } from "../domain/school-membership";
import { createSchoolMembershipRole } from "../domain/school-membership-role";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { SchoolRepository, updateSchoolDtoSchema } from "../infrastructure/school-repository";
import { CanManageSchool } from "./can-manage-school";
import { CanDeactivateSchool } from "./can-deactivate-school";

const actorSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

export class SchoolService {
  private readonly schools: SchoolRepository;

  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {
    this.schools = new SchoolRepository(db);
  }

  async create(actorUserId: string | null, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const ownerUserId = actorSchema.parse(actorUserId);
    const input = createSchoolDtoSchema.parse(raw);
    const owner = await this.db.user.findUnique({ where: { id: ownerUserId }, select: { status: true } });
    if (!owner) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (owner.status !== "ACTIVE") throw new SchoolError("FORBIDDEN", "Esta conta não pode criar escolas.", 403);
    // A random suffix lets schools share a display name without a check-then-insert race.
    const nameSlug = input.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "") || "escola";
    const slug = input.slug ?? `${nameSlug}-${randomUUID()}`;
    try {
      const now = this.clock();
      // The school and its initial owner commit together: a failed bootstrap
      // cannot leave a school without administrative access or a partial period.
      return await this.db.$transaction(async (tx) => {
        const school = await new SchoolRepository(tx).create(createSchoolDraft({ ...input, slug, ownerUserId }, now));
        const memberships = new SchoolMembershipRepository(tx);
        const membership = await memberships.create(transitionSchoolMembership(
          createSchoolMembership({ id: randomUUID(), schoolId: school.id, userId: ownerUserId }, now),
          MembershipStatus.ACTIVE,
          now,
        ));
        await memberships.addRole(createSchoolMembershipRole({
          id: randomUUID(), membershipId: membership.id, role: SchoolRole.OWNER,
        }, now));
        return school;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new SchoolError("SCHOOL_SLUG_TAKEN", "Este endereço de escola já está em uso.", 409);
      }
      throw error;
    }
  }

  async update(actorUserId: string | null, schoolId: string, raw: unknown) {
    const school = await this.get(actorUserId, schoolId);
    await new CanManageSchool(new SchoolMembershipRepository(this.db)).assert(actorUserId, school.id);
    const input = updateSchoolDtoSchema.parse(raw);

    try {
      return await this.schools.update(school.id, input, this.clock());
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new SchoolError("SCHOOL_SLUG_TAKEN", "Este endereço de escola já está em uso.", 409);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
      }
      throw error;
    }
  }

  async get(actorUserId: string | null, schoolId: string) {
    const actor = actorSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);

    try {
      const school = await this.schools.findById(schoolId);
      if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
      return school;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
      }
      throw error;
    }
  }

  deactivate(actorUserId: string | null, schoolId: string) {
    return this.changeStatus(actorUserId, schoolId, "INACTIVE");
  }

  reactivate(actorUserId: string | null, schoolId: string) {
    return this.changeStatus(actorUserId, schoolId, "ACTIVE");
  }

  private async requireOwnedSchool(actorUserId: string | null, schoolId: string) {
    const actor = actorSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    let school;
    try {
      school = await this.schools.findById(schoolId);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
      }
      throw error;
    }
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    if (school.ownerUserId !== actor.data) {
      throw new SchoolError("FORBIDDEN", "Você não pode alterar esta escola.", 403);
    }
    return school;
  }

  private async changeStatus(actorUserId: string | null, schoolId: string, status: "ACTIVE" | "INACTIVE") {
    const school = await this.get(actorUserId, schoolId);

    // ADR-007: reactivation must remain available after memberships were ended.
    // An already-inactive retry is read-only and preserves the original timestamps.
    if (status === "ACTIVE" || school.status === "INACTIVE") {
      await this.requireOwnedSchool(actorUserId, schoolId);
      if (status === "INACTIVE") return school;
    }

    try {
      if (status === "INACTIVE") {
        // Deactivation is a single unit of work: no active membership or assignment
        // may remain visible after the school transition commits. Period rows are
        // ended in place so their complete history remains queryable.
        const actor = actorSchema.parse(actorUserId);
        return await this.db.$transaction(async (tx) => {
          const schools = new SchoolRepository(tx);
          const current = await schools.findById(school.id);
          if (!current) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
          // Another deactivation may have committed since the initial read. Its
          // owner can retry even though the local OWNER period has now ended.
          if (current.status === "INACTIVE") {
            if (current.ownerUserId !== actor) {
              throw new SchoolError("FORBIDDEN", "Você não pode alterar esta escola.", 403);
            }
            return current;
          }
          await new CanDeactivateSchool(new SchoolMembershipRepository(tx)).assert(actorUserId, school.id);
          const endedAt = this.clock();
          const ended = { status: "ENDED" as const, endedAt, updatedAt: endedAt };
          const memberships = await tx.schoolMembership.updateMany({ where: { schoolId: school.id, status: "ACTIVE" }, data: ended });
          const athletes = await tx.schoolAthleteMembership.updateMany({ where: { schoolId: school.id, status: "ACTIVE" }, data: ended });
          const coaches = await tx.coachSchoolMembership.updateMany({ where: { schoolId: school.id, status: "ACTIVE" }, data: ended });
          const assignments = await tx.coachAthleteAssignment.updateMany({
            where: { schoolId: school.id, status: "ACTIVE" }, data: { ...ended, endedBy: actor },
          });

          // T146: cancel all future workout assignments belonging to this school.
          const futureStatuses = [WorkoutAssignmentStatus.SCHEDULED, WorkoutAssignmentStatus.AVAILABLE, WorkoutAssignmentStatus.RESCHEDULED];
          const futureWorkouts = await tx.workoutAssignment.findMany({
            where: { schoolId: school.id, status: { in: futureStatuses }, scheduledAt: { gte: endedAt } },
            select: { id: true },
          });
          if (futureWorkouts.length > 0) {
            await tx.workoutAssignment.updateMany({
              where: { id: { in: futureWorkouts.map((w) => w.id) } },
              data: { status: WorkoutAssignmentStatus.CANCELLED, updatedAt: endedAt },
            });
            await tx.workoutAssignmentHistory.createMany({
              data: futureWorkouts.map((w) => ({
                id: randomUUID(),
                workoutAssignmentId: w.id,
                eventType: "CANCELLED",
                actorUserId: actor,
                payload: { reason: "school_deactivated", schoolId: school.id } as Prisma.InputJsonValue,
                createdAt: endedAt,
              })),
            });
          }

          const deactivated = await schools.deactivate(school.id, endedAt);
          await tx.adminAuditLog.create({ data: {
            actorUserId: actor, action: "SCHOOL_DEACTIVATED", entityType: "School", entityId: school.id, createdAt: endedAt,
            metadata: {
              membershipsEnded: memberships.count, athleteMembershipsEnded: athletes.count,
              coachMembershipsEnded: coaches.count, assignmentsEnded: assignments.count,
              futureWorkoutsCancelled: futureWorkouts.length,
            },
          } });
          return deactivated;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      }
      // The repository conditionally updates the previous status so repeats preserve timestamps.
      return await this.schools.reactivate(school.id, this.clock());
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new SchoolError("SCHOOL_CONFLICT", "A escola foi alterada. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
