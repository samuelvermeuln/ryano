-- SAM-65 — open water as its own experience (§13.3–13.9, AC15).
-- The session context (course, environment, conditions with provenance,
-- responsible, support and signals, equipment, cancellation criterion,
-- distance estimate) belongs to the immutable prescription version; the
-- technical feedback (orientation, environmental difficulty, confidence,
-- equipment, observed conditions) to the athlete's report.
ALTER TABLE "Workout" ADD COLUMN "sessionContext" JSONB;
ALTER TABLE "AthleteFeedback" ADD COLUMN "technical" JSONB;

-- Rollback (manual):
-- ALTER TABLE "AthleteFeedback" DROP COLUMN "technical";
-- ALTER TABLE "Workout" DROP COLUMN "sessionContext";