/**
 * T241 — AuditService
 * T242 — Audit action enum/codes
 * T243 — Escola events
 * T244 — Membership events
 * T245 — Assignment events
 * T246 — Invitation events
 * T247 — Grant events
 * T248 — Workout + matching events
 * T249 — Evaluation events
 *
 * Design:
 *  - `AuditService.log()` is fire-and-forget inside use cases — errors are
 *    swallowed so audit failures never block the main flow.
 *  - All actions follow the pattern ENTITY_VERB (snake_case for DB storage).
 *  - The service is injected into use cases that need audit; it should NOT
 *    be called from domain functions (keeps domain pure).
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// T242 — Audit action codes
// ---------------------------------------------------------------------------

export const AuditAction = {
  // T243 — School
  SCHOOL_CREATED:            "school.created",
  SCHOOL_UPDATED:            "school.updated",
  SCHOOL_DEACTIVATED:        "school.deactivated",
  SCHOOL_REACTIVATED:        "school.reactivated",

  // T244 — Memberships
  COACH_INVITED:             "coach.invited",
  COACH_JOINED:              "coach.joined",
  COACH_LEFT:                "coach.left",
  COACH_REMOVED:             "coach.removed",
  ATHLETE_JOINED:            "athlete.joined",
  ATHLETE_LEFT:              "athlete.left",
  ATHLETE_REMOVED:           "athlete.removed",
  ATHLETE_COACH_CHANGED:     "athlete.coach_changed",

  // T245 — Assignments (workout prescriptions)
  WORKOUT_ASSIGNED:          "workout.assigned",
  WORKOUT_ASSIGNED_TEAM:     "workout.assigned_team",
  WORKOUT_RESCHEDULED:       "workout.rescheduled",
  WORKOUT_CANCELLED:         "workout.cancelled",

  // T246 — Invitations
  INVITE_CREATED:            "invite.created",
  INVITE_USED:               "invite.used",
  INVITE_REVOKED:            "invite.revoked",

  // T247 — History-access grants
  GRANT_CREATED:             "grant.created",
  GRANT_REVOKED:             "grant.revoked",

  // T248 — Workout execution + matching
  EXECUTION_MATCHED:         "execution.matched",
  EXECUTION_CONFIRMED:       "execution.confirmed",
  EXECUTION_OVERRIDDEN:      "execution.overridden",
  EXECUTION_UNMATCHED:       "execution.unmatched",

  // T249 — Evaluations and feedback
  EVALUATION_CREATED:        "evaluation.created",
  EVALUATION_UPDATED:        "evaluation.updated",
  FEEDBACK_SUBMITTED:        "feedback.submitted",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditEntityType = {
  SCHOOL:              "School",
  COACH_MEMBERSHIP:    "CoachSchoolMembership",
  ATHLETE_MEMBERSHIP:  "SchoolAthleteMembership",
  ASSIGNMENT:          "WorkoutAssignment",
  INVITE:              "InvitationLink",
  GRANT:               "HistoryAccessGrant",
  EXECUTION:           "WorkoutExecution",
  EVALUATION:          "CoachEvaluation",
  FEEDBACK:            "AthleteFeedback",
} as const;

export type AuditEntityType = (typeof AuditEntityType)[keyof typeof AuditEntityType];

// ---------------------------------------------------------------------------
// T241 — AuditService
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  schoolId: string;
  actorUserId?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Appends an audit record. Fire-and-forget — errors are swallowed so audit
   * failures never interrupt the business operation.
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.db.schoolAuditLog.create({
        data: {
          id:          randomUUID(),
          schoolId:    entry.schoolId,
          actorUserId: entry.actorUserId ?? null,
          action:      entry.action,
          entityType:  entry.entityType,
          entityId:    entry.entityId,
          metadata:    (entry.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Intentional: audit failure must not propagate to callers.
    }
  }

  /**
   * Convenience: log multiple events in one call (still fire-and-forget each).
   * Used for fan-out operations like AssignWorkoutToTeam.
   */
  async logMany(entries: AuditLogEntry[]): Promise<void> {
    await Promise.allSettled(entries.map((e) => this.log(e)));
  }
}
