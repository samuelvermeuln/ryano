-- T240: school_audit_logs
-- Append-only audit trail for all school-module operations.
-- Rows are NEVER updated or deleted — they are the authoritative history.
-- actorUserId is nullable to support system-initiated events (e.g. scheduled jobs).

CREATE TABLE "SchoolAuditLog" (
  "id"            TEXT         NOT NULL,
  "schoolId"      TEXT         NOT NULL,
  "actorUserId"   TEXT,
  "action"        TEXT         NOT NULL,
  "entityType"    TEXT         NOT NULL,
  "entityId"      TEXT         NOT NULL,
  -- Structured context: before/after state, relevant IDs, etc.
  "metadata"      JSONB        NOT NULL DEFAULT '{}',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SchoolAuditLog_pkey" PRIMARY KEY ("id")
);

-- Fast lookup by school (most common query pattern)
CREATE INDEX "SchoolAuditLog_schoolId_createdAt_idx"
  ON "SchoolAuditLog"("schoolId", "createdAt" DESC);

-- Lookup all events for a specific entity
CREATE INDEX "SchoolAuditLog_entityType_entityId_idx"
  ON "SchoolAuditLog"("entityType", "entityId");

-- Lookup all actions by a specific user within a school
CREATE INDEX "SchoolAuditLog_actorUserId_schoolId_idx"
  ON "SchoolAuditLog"("actorUserId", "schoolId");
