# Escola Module — Production Migration Checklist (T365)

Run in order. Check each item before moving to the next.

---

## Pre-migration (day before)

- [ ] Feature flag `SCHOOL_MODULE_ENABLED` is `false` in production (default)
- [ ] All migrations `0001` through `0029` are reviewed and approved by a second engineer
- [ ] DB backup completed and verified (point-in-time recovery tested)
- [ ] Migration dry-run executed against a production snapshot: `psql < migration.sql` with `BEGIN; … ROLLBACK`
- [ ] All new indexes are `CONCURRENTLY` safe — confirm no table locks needed (all migrations use `CREATE INDEX IF NOT EXISTS`)
- [ ] Deployment candidate (`git sha`) is tagged and image built
- [ ] On-call engineer notified; rollback plan reviewed (see `escola-rollback-plan.md`)
- [ ] Maintenance window confirmed if migration estimated > 30 s (check `pg_stat_progress_create_index`)

## Migration execution

- [ ] Set `SCHOOL_MODULE_ENABLED=false` (should already be false — double-check)
- [ ] Run `prisma migrate deploy` against production DB
  ```
  DATABASE_URL=$PROD_DATABASE_URL npx prisma migrate deploy
  ```
- [ ] Verify migration status:
  ```
  SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;
  ```
- [ ] Confirm all 29 migrations show `finished_at IS NOT NULL`
- [ ] Check for replication lag (`SELECT now() - pg_last_xact_replay_timestamp()`) — should be < 10 s
- [ ] Spot-check constraints:
  ```sql
  -- InvitationLink tokenHash unique index
  SELECT indexname FROM pg_indexes WHERE tablename = 'InvitationLink' AND indexname LIKE '%tokenHash%';
  -- WorkoutExecution idempotency index
  SELECT indexname FROM pg_indexes WHERE tablename = 'WorkoutExecution' AND indexname LIKE '%source%';
  ```

## Smoke tests (before enabling flag)

- [ ] `GET /api/schools/search?q=test` returns `200` or `404` (module still disabled → `404`)
- [ ] `POST /api/schools` returns `404` (feature flag is off)
- [ ] Application health check passes: `GET /api/health` returns `200`

## Feature flag activation (T367 / T370)

- [ ] Set `SCHOOL_MODULE_ENABLED=true` for internal users only (via env split or allowlist)
- [ ] Internal smoke tests pass (see `T369 — Smoke test staging`)
- [ ] Error rate < 0.1 % for 15 minutes before broad rollout
- [ ] Gradual rollout: 5 % → 25 % → 100 % (see T372)

## Post-migration checks

- [ ] `prisma migrate status` shows all migrations applied with no drift
- [ ] New indexes appear in `pg_indexes`
- [ ] No long-running queries in `pg_stat_activity` related to the migration
- [ ] Datadog / observability dashboard shows nominal error rate
- [ ] schoolMetrics dashboard shows `matching_outcome`, `compliance_score` metrics flowing

---

## SAM-28 — `0054_public_profiles` (additive)

Adds `School.achievements`, `School.specialties`, `School.adminContactUserId` (FK `User`, RESTRICT, indexed) and `CoachProfile.sportTypes`, `CoachProfile.credentials`, `CoachProfile.acceptsIndependentAthletes` (default `true`). Every column has a default or is nullable, so no backfill and no lock beyond the `ALTER TABLE`.

- [ ] `prisma migrate deploy`; confirm `0054_public_profiles` in `_prisma_migrations`
- [ ] Smoke: `GET /api/schools/[id]/profile` returns `achievements: []` and `responsible` = owner for an untouched school; `GET /api/coaches/[id]/profile` returns `acceptsIndependentAthletes: true`

**Rollback** (safe while no school named a contact; otherwise clear the column first):

```sql
ALTER TABLE "CoachProfile" DROP COLUMN "acceptsIndependentAthletes", DROP COLUMN "credentials", DROP COLUMN "sportTypes";
DROP INDEX IF EXISTS "School_adminContactUserId_idx";
ALTER TABLE "School" DROP CONSTRAINT IF EXISTS "School_adminContactUserId_fkey";
ALTER TABLE "School" DROP COLUMN "adminContactUserId", DROP COLUMN "specialties", DROP COLUMN "achievements";
DELETE FROM "_prisma_migrations" WHERE migration_name = '0054_public_profiles';
```

Deploy the previous application build before running it: the current build selects these columns.

---

## SAM-29 — `0055_user_notifications` (additive)

Adds enum `UserNotificationKind` and table `UserNotification` (indexed by `userId, readAt, createdAt`; FK `User` CASCADE). No existing table changes.

- [ ] `prisma migrate deploy`; confirm `0055_user_notifications` in `_prisma_migrations`
- [ ] Smoke: `GET /api/notifications` returns `{ items: [], unreadCount: 0 }` for a fresh user; the bell renders without a badge

**Rollback** (deploy the previous build first; rows are derived state and may be discarded):

```sql
DROP TABLE "UserNotification";
DROP TYPE "UserNotificationKind";
DELETE FROM "_prisma_migrations" WHERE migration_name = '0055_user_notifications';
```

---

## SAM-30 — `0056_independent_coaching_context`

`AthleteTechnicalSheet.schoolId` becomes nullable and gains `coachId` (FK `CoachProfile` RESTRICT, CHECK "schoolId or coachId", partial unique `(coachId, athleteId) WHERE schoolId IS NULL`); `AthleteTechnicalSheetRevision.schoolId` and `CoachEvaluation.schoolId` become nullable; partial unique `CoachAthleteAssignment (athleteId, coachId) WHERE status = 'ACTIVE' AND schoolId IS NULL`; enum `UserNotificationKind` += `COACH_TRANSFER_PROPOSED`, `COACH_TRANSFER_CONFIRMED`. The old code keeps working against the migrated schema (it never writes NULLs there); the new code needs the migration for the independent hub (`/professor/independente/atletas/*`) — without it the technical-sheet query fails with P2022 (`coachId` missing).

- [ ] Before deploying: `SELECT "athleteId", "coachId", count(*) FROM "CoachAthleteAssignment" WHERE status = 'ACTIVE' AND "schoolId" IS NULL GROUP BY 1, 2 HAVING count(*) > 1;` must return no rows — the migration aborts on duplicates (end the extra periods first)
- [ ] `prisma migrate deploy`; confirm `0056_independent_coaching_context` in `_prisma_migrations`
- [ ] Smoke: as an independent coach, open `/professor/independente` → an athlete → the hub renders; prescribe; the athlete sees it in `/app/treinos` and opens `/app/treinos/<id>`
- [ ] E2E: `e2e/38-coach-independente-central.spec.ts`, `e2e/39-transferencia-atleta.spec.ts`

**Rollback** (deploy the previous build first):

```sql
DROP INDEX "CoachAthleteAssignment_active_independent_pair_key";
DROP INDEX "AthleteTechnicalSheet_independent_coach_athlete_key";
DROP INDEX "AthleteTechnicalSheet_coachId_athleteId_idx";
ALTER TABLE "AthleteTechnicalSheet" DROP CONSTRAINT "AthleteTechnicalSheet_scope_check", DROP CONSTRAINT "AthleteTechnicalSheet_coachId_fkey", DROP COLUMN "coachId";
-- SET NOT NULL again only after deleting rows with "schoolId" IS NULL in the three tables.
DELETE FROM "_prisma_migrations" WHERE migration_name = '0056_independent_coaching_context';
-- Enum values cannot be dropped; leaving them is harmless.
```

---

## SAM-38 — `0057_rich_activity_model` (additive)

`Activity` gains the extended stats (title, subSportType, timer/elapsed seconds, calories split, strokes/SWOLF, temperature, training load/effect + labels, energy impact + label, route polyline and start/end coordinates), `duplicateOfActivityId` (self FK, SET NULL) and `detailSyncedAt`; new enums `MetricSourceKind`, `ActivityZoneType`, `ActivityStreamKey`; new tables `ActivityLap`, `ActivityZone`, `ActivityStream` (CASCADE on activity); `AthleteFeedback.workoutExecutionId`/`workoutAssignmentId` become nullable, `activityId` (unique, FK CASCADE) is added, CHECK "execution XOR activity". The old code keeps working (it never writes NULLs there and reads only aggregates); the new readers (SAM-40) prefer the tables and fall back to the legacy JSON until SAM-39's backfill runs. ADR-006.

- [ ] `prisma migrate deploy`; confirm `0057_rich_activity_model` in `_prisma_migrations`
- [ ] Smoke: `/app/atividades/[id]` and `/professor/.../atividades/[id]` still render for a Strava and a Garmin activity (no tables filled yet)
- [ ] E2E: `e2e/28`, `e2e/41`

**Rollback** (deploy the previous build first): the commented block at the end of the migration file (drop the CHECK, the FK and the column on `AthleteFeedback` — SET NOT NULL only after deleting activity-anchored rows —, the three tables, the three enums, the FK/index and the new columns on `Activity`), then `DELETE FROM "_prisma_migrations" WHERE migration_name = '0057_rich_activity_model';`.

## SAM-42 — `0058_athlete_daily_health` (additive)

New table `AthleteDailyHealth` — one row per `(userId, provider, date)` (local day `YYYY-MM-DD` + `timeZone`), FK `User` CASCADE, every metric nullable, proprietary energy score with the provider's label (`energyLabel`), `raw` JSON for audit. Nothing else changes. The dashboard reads the table first and falls back to the live snapshot for a day not yet ingested. ADR-005.

- [ ] `prisma migrate deploy`; confirm `0058_athlete_daily_health`
- [ ] Run `npx tsx scripts/ingest-daily-health.ts` once (today for every connection with a health capability) and confirm one row per user/provider/day
- [ ] Smoke: the athlete dashboard still shows the health cards; `/api/admin/whatsapp-reports/preview` unchanged

**Rollback**: `DROP TABLE "AthleteDailyHealth"; DELETE FROM "_prisma_migrations" WHERE migration_name = '0058_athlete_daily_health';`

---

## SAM-50 — `0059_athlete_sport_levels` (additive)

New table `AthleteSportLevel` — one row per `(sheetId, sportType, environment)` under `AthleteTechnicalSheet` (CASCADE), level CHECK (`BEGINNER | INTERMEDIATE | ADVANCED | PROFESSIONAL`), assessor FK `User` RESTRICT. The legacy `AthleteTechnicalSheet.experienceLevel` stays. **The technical sheet screen reads the new relation, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0059_athlete_sport_levels`
- [ ] Smoke: open a technical sheet (school and independent) and save one level
- [ ] Run `e2e/49-niveis-por-modalidade.spec.ts`

**Rollback**: `DROP TABLE "AthleteSportLevel"; DELETE FROM "_prisma_migrations" WHERE migration_name = '0059_athlete_sport_levels';`

---

## Contacts

| Role | Contact |
|---|---|
| DB admin | (fill in) |
| On-call engineer | (fill in) |
| Product owner | (fill in) |
