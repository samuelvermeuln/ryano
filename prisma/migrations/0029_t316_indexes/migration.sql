-- T316: Add missing indexes for hot query paths
-- Identified by EXPLAIN analysis of runtime query patterns.

-- WorkoutAssignment: combined filter (schoolId + athleteId + status + cursor)
-- used by GET /api/workout-assignments when a coach queries for a specific athlete
CREATE INDEX IF NOT EXISTS "WorkoutAssignment_schoolId_athleteId_status_id_idx"
  ON "WorkoutAssignment"("schoolId", "athleteId", "status", "id");

-- WorkoutExecution: ordered listing by assignment
-- used by GET /api/workout-assignments/[id]/executions (ORDER BY createdAt DESC)
CREATE INDEX IF NOT EXISTS "WorkoutExecution_workoutAssignmentId_createdAt_idx"
  ON "WorkoutExecution"("workoutAssignmentId", "createdAt" DESC);

-- CoachEvaluation: athlete-scoped visibility filter
-- used by GET /api/workout-executions/[id]/evaluation (WHERE executionId = ? AND isVisible = true)
CREATE INDEX IF NOT EXISTS "CoachEvaluation_workoutExecutionId_isVisible_idx"
  ON "CoachEvaluation"("workoutExecutionId", "isVisible");

-- WorkoutCompliance: athlete timeline listing ordered by most recent
CREATE INDEX IF NOT EXISTS "WorkoutCompliance_athleteId_calculatedAt_idx"
  ON "WorkoutCompliance"("athleteId", "calculatedAt" DESC);

-- AdminAuditLog: actor and entity queries (no indexes existed before)
CREATE INDEX IF NOT EXISTS "AdminAuditLog_actorUserId_createdAt_idx"
  ON "AdminAuditLog"("actorUserId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AdminAuditLog_entityType_entityId_idx"
  ON "AdminAuditLog"("entityType", "entityId");

-- InvitationUse: replay check (WHERE invitationId = ? AND userId = ?)
-- used in AcceptInvitation to detect duplicate acceptance
CREATE INDEX IF NOT EXISTS "InvitationUse_invitationId_userId_idx"
  ON "InvitationUse"("invitationId", "userId");
