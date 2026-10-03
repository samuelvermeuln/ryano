-- SAM-73 — append-only corrections of an activity's data (§18.3): the
-- provider's original is never overwritten; the corrected value, the reason
-- and the author stay readable.

CREATE TABLE "ActivityCorrection" (
  "id"             TEXT NOT NULL,
  "activityId"     TEXT NOT NULL,
  "field"          VARCHAR(40) NOT NULL,
  "originalValue"  DECIMAL(14, 3),
  "correctedValue" DECIMAL(14, 3) NOT NULL,
  "reason"         VARCHAR(1000) NOT NULL,
  "method"         VARCHAR(300),
  "authorUserId"   TEXT NOT NULL,
  "authorRole"     VARCHAR(10) NOT NULL,
  "createdAt"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActivityCorrection_field_check" CHECK ("field" IN ('distanceMeters', 'movingSeconds', 'poolLengthMeters')),
  CONSTRAINT "ActivityCorrection_role_check" CHECK ("authorRole" IN ('athlete', 'coach'))
);
CREATE INDEX "ActivityCorrection_activityId_createdAt_idx" ON "ActivityCorrection"("activityId", "createdAt");
ALTER TABLE "ActivityCorrection" ADD CONSTRAINT "ActivityCorrection_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityCorrection" ADD CONSTRAINT "ActivityCorrection_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback (manual): DROP TABLE "ActivityCorrection";