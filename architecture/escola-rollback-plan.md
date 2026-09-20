# Escola Module — Rollback Plan (T366)

This document describes how to roll back the Escola module if a critical issue is discovered after deployment.

---

## Rollback strategy overview

The Escola module is protected by a **feature flag** (`SCHOOL_MODULE_ENABLED`). For most issues,
disabling the flag is sufficient without rolling back the database schema.

Rollback levels (in order of preference):

1. **Flag off** — disable `SCHOOL_MODULE_ENABLED` (instant, no DB change)
2. **Application rollback** — redeploy previous image (if code regression; flag stays off)
3. **Schema rollback** — reverse migrations (last resort; only if data integrity is at risk)

---

## Level 1: Feature flag off (< 1 minute)

```bash
# Set SCHOOL_MODULE_ENABLED=false in your secrets/config manager, then redeploy
# OR inject at runtime if your platform supports hot env updates
```

**Effect:** All `assertSchoolModuleEnabled()` gates return `404`. Existing data is untouched.
No DB migration needed. Users lose access to school features but no data is lost.

**When to use:** Any production error surfaced in school-specific endpoints.

---

## Level 2: Application rollback

```bash
# Redeploy the previous tagged image
kubectl rollout undo deployment/ryvano-web    # k8s example
# OR
fly deploy --image registry/ryvano:PREV_SHA  # fly.io example
```

**Effect:** Previous code serves requests. Schema is still at migration `0029`.
Feature flag must stay `false` until the regression is fixed.

**When to use:** The bug is in application code, not schema. The new schema is backward-compatible
(all migrations use additive changes only — new tables, new columns with defaults, new indexes).

---

## Level 3: Schema rollback (last resort)

> ⚠️  Only proceed here if the schema change itself caused data corruption or a constraint
> violation that blocks normal operation. In practice, all Escola migrations are additive and
> reversible without data loss since no columns were removed.

### Reverse migration SQL

Run in a transaction; abort if any step fails.

```sql
BEGIN;

-- 0029: Remove T316 indexes (safe; CREATE INDEX IF NOT EXISTS)
DROP INDEX IF EXISTS "WorkoutAssignment_schoolId_athleteId_status_id_idx";
DROP INDEX IF EXISTS "WorkoutExecution_workoutAssignmentId_createdAt_idx";
DROP INDEX IF EXISTS "CoachEvaluation_workoutExecutionId_isVisible_idx";
DROP INDEX IF EXISTS "WorkoutCompliance_athleteId_calculatedAt_idx";
DROP INDEX IF EXISTS "AdminAuditLog_actorUserId_createdAt_idx";
DROP INDEX IF EXISTS "AdminAuditLog_entityType_entityId_idx";
DROP INDEX IF EXISTS "InvitationUse_invitationId_userId_idx";

-- Repeat for 0028 → 0001 in reverse order if needed.
-- Refer to each migration file for the CREATE TABLE / ADD COLUMN statement to reverse.

-- Update prisma migration table to reflect the rollback
DELETE FROM "_prisma_migrations" WHERE migration_name = '0029_t316_indexes';

COMMIT;
```

After the schema rollback, redeploy the previous application image (Level 2).

### Verifying a clean rollback

```sql
-- Confirm the index no longer exists
SELECT indexname FROM pg_indexes
WHERE tablename = 'WorkoutAssignment'
  AND indexname = 'WorkoutAssignment_schoolId_athleteId_status_id_idx';
-- Should return 0 rows.

-- Confirm prisma_migrations table is updated
SELECT migration_name, rolled_back_at FROM "_prisma_migrations"
ORDER BY finished_at DESC LIMIT 5;
```

---

## Decision tree

```
Production issue detected
        │
        ▼
Is it school-module-specific?
    No → follow standard incident process
    Yes ▼
        │
        ▼
Disable SCHOOL_MODULE_ENABLED flag
        │
        ▼
Issue resolved? ──Yes──▶ Monitor for 15 min, re-enable flag when fix deployed
        │
       No
        │
        ▼
Code regression (not schema)?
    Yes → redeploy previous image (Level 2)
    No ▼
        │
        ▼
Schema caused data corruption?
    Yes → schema rollback (Level 3) + notify DBA
    No  → investigate further; schema is additive; flag stays off
```

---

## Contacts and escalation

| Step | Owner | Contact |
|---|---|---|
| Flag disable | On-call engineer | (fill in) |
| Image rollback | Platform/DevOps | (fill in) |
| Schema rollback | DBA + Tech Lead | (fill in) |
| User communication | Product Owner | (fill in) |
