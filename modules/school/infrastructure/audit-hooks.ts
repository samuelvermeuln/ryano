/**
 * T243–T249 — Audit instrumentation hooks
 *
 * Thin wrappers (decorator pattern) around use cases that post an audit event
 * after the operation succeeds. The wrapped versions are used by API routes.
 *
 * Rules:
 *  - Audit calls are always AFTER the business operation succeeds.
 *  - Audit failure NEVER propagates (fire-and-forget via AuditService.log).
 *  - Wrappers are purely additive — they never change the return value.
 */
import type { PrismaClient } from "@prisma/client";
import { AuditService, AuditAction, AuditEntityType } from "./audit-service";

export function createAuditService(db: PrismaClient): AuditService {
  return new AuditService(db);
}

// ---------------------------------------------------------------------------
// T243 — School audit hooks
// ---------------------------------------------------------------------------

/** Wraps a school-creation result and logs the event. */
export async function auditSchoolCreated(
  audit: AuditService,
  opts: { schoolId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.SCHOOL_CREATED,
    entityType:  AuditEntityType.SCHOOL,
    entityId:    opts.schoolId,
  });
}

export async function auditSchoolUpdated(
  audit: AuditService,
  opts: { schoolId: string; actorUserId: string | null; changes: Record<string, unknown> },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.SCHOOL_UPDATED,
    entityType:  AuditEntityType.SCHOOL,
    entityId:    opts.schoolId,
    metadata:    { changes: opts.changes },
  });
}

export async function auditSchoolDeactivated(
  audit: AuditService,
  opts: { schoolId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.SCHOOL_DEACTIVATED,
    entityType:  AuditEntityType.SCHOOL,
    entityId:    opts.schoolId,
  });
}

// ---------------------------------------------------------------------------
// T244 — Membership audit hooks
// ---------------------------------------------------------------------------

export async function auditCoachJoined(
  audit: AuditService,
  opts: { schoolId: string; coachId: string; membershipId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.COACH_JOINED,
    entityType:  AuditEntityType.COACH_MEMBERSHIP,
    entityId:    opts.membershipId,
    metadata:    { coachId: opts.coachId },
  });
}

export async function auditCoachLeft(
  audit: AuditService,
  opts: { schoolId: string; coachId: string; membershipId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.COACH_LEFT,
    entityType:  AuditEntityType.COACH_MEMBERSHIP,
    entityId:    opts.membershipId,
    metadata:    { coachId: opts.coachId },
  });
}

export async function auditAthleteJoined(
  audit: AuditService,
  opts: { schoolId: string; athleteId: string; membershipId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.ATHLETE_JOINED,
    entityType:  AuditEntityType.ATHLETE_MEMBERSHIP,
    entityId:    opts.membershipId,
    metadata:    { athleteId: opts.athleteId },
  });
}

export async function auditAthleteLeft(
  audit: AuditService,
  opts: { schoolId: string; athleteId: string; membershipId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.ATHLETE_LEFT,
    entityType:  AuditEntityType.ATHLETE_MEMBERSHIP,
    entityId:    opts.membershipId,
    metadata:    { athleteId: opts.athleteId },
  });
}

export async function auditAthleteCoachChanged(
  audit: AuditService,
  opts: { schoolId: string; athleteId: string; previousCoachId: string | null; newCoachId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.ATHLETE_COACH_CHANGED,
    entityType:  AuditEntityType.ATHLETE_MEMBERSHIP,
    entityId:    opts.athleteId,
    metadata:    { previousCoachId: opts.previousCoachId, newCoachId: opts.newCoachId },
  });
}

// ---------------------------------------------------------------------------
// T245 — Assignment audit hooks
// ---------------------------------------------------------------------------

export async function auditWorkoutAssigned(
  audit: AuditService,
  opts: { schoolId: string; assignmentId: string; athleteId: string; workoutId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.WORKOUT_ASSIGNED,
    entityType:  AuditEntityType.ASSIGNMENT,
    entityId:    opts.assignmentId,
    metadata:    { athleteId: opts.athleteId, workoutId: opts.workoutId },
  });
}

export async function auditWorkoutAssignedTeam(
  audit: AuditService,
  opts: { schoolId: string; teamId: string; workoutId: string; assignmentIds: string[]; actorUserId: string | null },
): Promise<void> {
  await audit.logMany(opts.assignmentIds.map((id) => ({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.WORKOUT_ASSIGNED_TEAM,
    entityType:  AuditEntityType.ASSIGNMENT,
    entityId:    id,
    metadata:    { teamId: opts.teamId, workoutId: opts.workoutId },
  })));
}

export async function auditWorkoutCancelled(
  audit: AuditService,
  opts: { schoolId: string; assignmentId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.WORKOUT_CANCELLED,
    entityType:  AuditEntityType.ASSIGNMENT,
    entityId:    opts.assignmentId,
  });
}

// ---------------------------------------------------------------------------
// T246 — Invitation audit hooks
// ---------------------------------------------------------------------------

export async function auditInviteCreated(
  audit: AuditService,
  opts: { schoolId: string; inviteId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.INVITE_CREATED,
    entityType:  AuditEntityType.INVITE,
    entityId:    opts.inviteId,
  });
}

export async function auditInviteRevoked(
  audit: AuditService,
  opts: { schoolId: string; inviteId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.INVITE_REVOKED,
    entityType:  AuditEntityType.INVITE,
    entityId:    opts.inviteId,
  });
}

export async function auditInviteUsed(
  audit: AuditService,
  opts: { schoolId: string; inviteId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.INVITE_USED,
    entityType:  AuditEntityType.INVITE,
    entityId:    opts.inviteId,
  });
}

// ---------------------------------------------------------------------------
// T247 — History-access grant audit hooks
// ---------------------------------------------------------------------------

export async function auditGrantCreated(
  audit: AuditService,
  opts: { schoolId: string; grantId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.GRANT_CREATED,
    entityType:  AuditEntityType.GRANT,
    entityId:    opts.grantId,
  });
}

export async function auditGrantRevoked(
  audit: AuditService,
  opts: { schoolId: string; grantId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.GRANT_REVOKED,
    entityType:  AuditEntityType.GRANT,
    entityId:    opts.grantId,
  });
}

// ---------------------------------------------------------------------------
// T248 — Workout execution + matching audit hooks
// ---------------------------------------------------------------------------

export async function auditExecutionMatched(
  audit: AuditService,
  opts: { schoolId: string; executionId: string; score: number; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.EXECUTION_MATCHED,
    entityType:  AuditEntityType.EXECUTION,
    entityId:    opts.executionId,
    metadata:    { score: opts.score },
  });
}

export async function auditExecutionConfirmed(
  audit: AuditService,
  opts: { schoolId: string; executionId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.EXECUTION_CONFIRMED,
    entityType:  AuditEntityType.EXECUTION,
    entityId:    opts.executionId,
  });
}

export async function auditExecutionOverridden(
  audit: AuditService,
  opts: { schoolId: string; executionId: string; previousExecutionId: string | null; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.EXECUTION_OVERRIDDEN,
    entityType:  AuditEntityType.EXECUTION,
    entityId:    opts.executionId,
    metadata:    { previousExecutionId: opts.previousExecutionId },
  });
}

export async function auditExecutionUnmatched(
  audit: AuditService,
  opts: { schoolId: string; executionId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.EXECUTION_UNMATCHED,
    entityType:  AuditEntityType.EXECUTION,
    entityId:    opts.executionId,
  });
}

// ---------------------------------------------------------------------------
// T249 — Evaluation audit hooks
// ---------------------------------------------------------------------------

export async function auditEvaluationCreated(
  audit: AuditService,
  opts: { schoolId: string; evaluationId: string; coachId: string; athleteId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.EVALUATION_CREATED,
    entityType:  AuditEntityType.EVALUATION,
    entityId:    opts.evaluationId,
    metadata:    { coachId: opts.coachId, athleteId: opts.athleteId },
  });
}

export async function auditEvaluationUpdated(
  audit: AuditService,
  opts: { schoolId: string; evaluationId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.EVALUATION_UPDATED,
    entityType:  AuditEntityType.EVALUATION,
    entityId:    opts.evaluationId,
  });
}

export async function auditFeedbackSubmitted(
  audit: AuditService,
  opts: { schoolId: string; feedbackId: string; actorUserId: string | null },
): Promise<void> {
  await audit.log({
    schoolId:    opts.schoolId,
    actorUserId: opts.actorUserId,
    action:      AuditAction.FEEDBACK_SUBMITTED,
    entityType:  AuditEntityType.FEEDBACK,
    entityId:    opts.feedbackId,
  });
}
