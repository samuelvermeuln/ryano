import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export type WorkoutAssignmentParticipantRole = "athlete" | "coach" | "manager";

export interface WorkoutAssignmentParticipant {
  role: WorkoutAssignmentParticipantRole;
  assignment: {
    id: string;
    athleteId: string;
    coachId: string | null;
    schoolId: string | null;
    status: string;
    scheduledAt: Date | null;
  };
}

type Client = Pick<PrismaClient, "workoutAssignment" | "coachProfile" | "schoolMembership" | "schoolMembershipRole"> | Prisma.TransactionClient;

/**
 * SAM-27 — who the actor is for one prescription: the athlete it was written
 * for, the coach who owns it, or an OWNER/ADMIN of its school. Anyone else gets
 * a 404, so the URL never confirms a prescription they cannot see.
 */
export async function resolveWorkoutAssignmentParticipant(
  db: Client,
  actorUserId: string | null,
  assignmentId: string,
): Promise<WorkoutAssignmentParticipant> {
  const actor = id.safeParse(actorUserId);
  if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
  const notFound = () => new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Prescrição não encontrada.", 404);
  if (!id.safeParse(assignmentId).success) throw notFound();

  const assignment = await db.workoutAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, athleteId: true, coachId: true, schoolId: true, status: true, scheduledAt: true },
  });
  if (!assignment) throw notFound();

  if (assignment.athleteId === actor.data) return { role: "athlete", assignment };

  if (assignment.coachId) {
    const coach = await db.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true } });
    if (coach && coach.id === assignment.coachId) return { role: "coach", assignment };
  }

  if (assignment.schoolId) {
    const manages = await new CanManageMembers(new SchoolMembershipRepository(db)).execute(actor.data, assignment.schoolId);
    if (manages) return { role: "manager", assignment };
  }

  throw notFound();
}
