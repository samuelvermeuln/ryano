import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import {
  createWorkoutAssignmentComment,
  WorkoutAssignmentCommentKind,
  workoutAssignmentCommentBodySchema,
} from "../domain/workout-assignment-comment";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { resolveWorkoutAssignmentParticipant } from "./workout-assignment-participant";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const commentWorkoutAssignmentSchema = z.strictObject({
  body: workoutAssignmentCommentBodySchema,
  kind: z.enum(WorkoutAssignmentCommentKind).default(WorkoutAssignmentCommentKind.COMMENT),
});
export type CommentWorkoutAssignmentInput = z.input<typeof commentWorkoutAssignmentSchema>;

const MATCHED_STATUSES = ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] as const;

/**
 * SAM-27 — a message on one prescription, from the athlete, the coach who
 * owns it or the school's administration. A REVIEW_REQUEST is the athlete's
 * alone, needs an executed session to review, and only one may be open at a
 * time; the coach resolves it by evaluating (see manage-evaluation).
 */
export class CommentWorkoutAssignment {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, assignmentId: string, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = commentWorkoutAssignmentSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const { role, assignment } = await resolveWorkoutAssignmentParticipant(tx, actor.data, assignmentId);

        if (input.kind === WorkoutAssignmentCommentKind.REVIEW_REQUEST) {
          if (role !== "athlete") {
            throw new SchoolError("FORBIDDEN", "Só o atleta pode pedir a revisão do seu treino.", 403);
          }
          const executed = await tx.workoutExecution.findFirst({
            where: { workoutAssignmentId: assignment.id, matchStatus: { in: [...MATCHED_STATUSES] } },
            select: { id: true },
          });
          if (!executed) {
            throw new SchoolError("WORKOUT_REVIEW_NO_EXECUTION", "Peça a revisão depois que a atividade deste treino for importada.", 409);
          }
          const open = await tx.workoutAssignmentComment.findFirst({
            where: { workoutAssignmentId: assignment.id, kind: WorkoutAssignmentCommentKind.REVIEW_REQUEST, resolvedAt: null },
            select: { id: true },
          });
          if (open) {
            throw new SchoolError("WORKOUT_REVIEW_ALREADY_REQUESTED", "Você já pediu a revisão deste treino; aguarde o professor.", 409);
          }
        }

        const now = this.clock();
        const comment = createWorkoutAssignmentComment({
          id: randomUUID(), workoutAssignmentId: assignment.id, authorUserId: actor.data, kind: input.kind, body: input.body,
        }, now);
        const saved = await tx.workoutAssignmentComment.create({ data: comment });

        if (assignment.schoolId) {
          await new AuditService(tx).log({
            schoolId: assignment.schoolId,
            actorUserId: actor.data,
            action: input.kind === WorkoutAssignmentCommentKind.REVIEW_REQUEST ? AuditAction.WORKOUT_REVIEW_REQUESTED : AuditAction.WORKOUT_COMMENTED,
            entityType: AuditEntityType.COMMENT,
            entityId: saved.id,
            metadata: { workoutAssignmentId: assignment.id, role },
          });
        }

        return saved;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_COMMENT_CONFLICT", "Não foi possível registrar agora. Tente novamente.", 409);
      }
      throw error;
    }
  }
}

/** One message as the screens render it (SAM-27). */
export interface WorkoutAssignmentCommentView {
  id: string;
  kind: WorkoutAssignmentCommentKind;
  body: string;
  createdAt: Date;
  resolvedAt: Date | null;
  author: { id: string; name: string | null; image: string | null };
}

/** The whole conversation on one prescription, oldest first, for any participant. */
export class ListWorkoutAssignmentComments {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, assignmentId: string): Promise<WorkoutAssignmentCommentView[]> {
    const { assignment } = await resolveWorkoutAssignmentParticipant(this.db, actorUserId, assignmentId);
    const rows = await this.db.workoutAssignmentComment.findMany({
      where: { workoutAssignmentId: assignment.id },
      select: {
        id: true, kind: true, body: true, createdAt: true, resolvedAt: true,
        author: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({ ...row, kind: row.kind as WorkoutAssignmentCommentKind }));
  }
}
