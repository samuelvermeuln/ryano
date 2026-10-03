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

## SAM-51 — `0060_sport_events` (additive)

New tables `SportEvent` (local date + IANA zone, start time only when confirmed, visibility PRIVATE/SCHOOL/PUBLIC with CHECK that SCHOOL names its school, `version` for optimistic concurrency), `SportEventOption` (distance value+unit together, never converted), `AthleteEventParticipation` (suggested × agreed priority, `needsReviewSince`), `SportEventRevision` and `ParticipationRevision` (append-only before/after). Nothing existing changes.

- [ ] `prisma migrate deploy`; confirm `0060_sport_events`
- [ ] Run `e2e/50-evento-participacao.spec.ts`

**Rollback**: `DROP TABLE "ParticipationRevision", "SportEventRevision", "AthleteEventParticipation", "SportEventOption", "SportEvent"; DELETE FROM "_prisma_migrations" WHERE migration_name = '0060_sport_events';`

---

## SAM-53 — `0061_athlete_goals` (additive, after 0060)

New tables `AthleteGoal` (type/status/origin CHECKs; `desiredGoalId` self FK only on COACH_AGREED; range CHECK; optional FK to `AthleteEventParticipation`) and `AthleteGoalRevision` (append-only). **The technical sheet screen reads the goals, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0061_athlete_goals`
- [ ] Run `e2e/52-objetivos-desejado-pactuado.spec.ts` (and `e2e/49` as regression of the technical sheet)

**Rollback**: `DROP TABLE "AthleteGoalRevision", "AthleteGoal"; DELETE FROM "_prisma_migrations" WHERE migration_name = '0061_athlete_goals';`

---

## SAM-54 — `0062_event_preparations` (additive, after 0060)

New tables `EventPreparation` (one per participation; CHECK "no responsible ⇔ UNASSIGNED/CLOSED") and `EventPreparationTransition` (append-only; null actor = system). Backfills one UNASSIGNED record (CLOSED for cancelled ones) per existing participation. **Event registration writes the preparation, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0062_event_preparations`
- [ ] Run `e2e/53-acompanhamento-responsavel.spec.ts` (and 50 as regression)

**Rollback**: `DROP TABLE "EventPreparationTransition", "EventPreparation"; DELETE FROM "_prisma_migrations" WHERE migration_name = '0062_event_preparations';`

---

## SAM-55 — `0063_follow_up_tasks` (additive, after 0062)

Adds 13 `UserNotificationKind` values (§7.1 matrix), `UserNotification.dedupeKey` with unique `(userId, dedupeKey)` (NULLs stay distinct, old rows unaffected), and tables `FollowUpTask` (unique `dedupeKey`; CHECK owner = user or school queue; CHECK RESCHEDULED has a date) and `FollowUpTaskTransition`. **The Prisma client of this build selects `dedupeKey` on every notification write, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0063_follow_up_tasks`
- [ ] Run `e2e/54-pendencias-avisos.spec.ts` (and 50, 53 as regression)

**Rollback (0063)** (deploy the previous build first; enum values stay): `DROP TABLE "FollowUpTaskTransition", "FollowUpTask"; DROP INDEX "UserNotification_userId_dedupeKey_key"; ALTER TABLE "UserNotification" DROP COLUMN "dedupeKey"; DELETE FROM "_prisma_migrations" WHERE migration_name = '0063_follow_up_tasks';`

---


---

## SAM-56 — `0064_follow_up_reminders` (additive, after 0063)

`NotificationPreference.quietHoursStart/End` (nullable), tables `FollowUpPolicy` (one per school or per independent coach; CHECK exactly one owner) and `ScheduledReminder` (unique `dedupeKey`, status CHECK). **Event registration schedules reminders, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0064_follow_up_reminders`
- [ ] Set `FOLLOW_UP_ADMIN_KEY` and schedule `POST /api/jobs/follow-ups` (e.g. every 15 min, `Authorization: Bearer <key>`)
- [ ] Run `e2e/55-lembretes-prazos.spec.ts` (and 50, 53, 54 as regression)

**Rollback**: `DROP TABLE "ScheduledReminder", "FollowUpPolicy"; ALTER TABLE "NotificationPreference" DROP COLUMN "quietHoursEnd", DROP COLUMN "quietHoursStart"; DELETE FROM "_prisma_migrations" WHERE migration_name = '0064_follow_up_reminders';`
---

## SAM-57 — `0065_athlete_unavailability` (additive)

New table `AthleteUnavailability` (athlete's periods shown on the calendar; CHECK end ≥ start). **The athlete calendar reads it, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0065_athlete_unavailability`
- [ ] Run `e2e/56-meus-eventos-aluno.spec.ts`

**Rollback**: `DROP TABLE "AthleteUnavailability"; DELETE FROM "_prisma_migrations" WHERE migration_name = '0065_athlete_unavailability';`
---

## SAM-58 — `0066_workout_template_versions` (additive)

`WorkoutTemplate` gains classification columns (`code`, `contentKind` CHECK, `environment`, `sessionType`, `capabilities[]`, `level`, `phase`, `tags[]`, `folder`, `parentTemplateId` self FK, `searchText`, `archivedAt`); new tables `WorkoutTemplateVersion` (immutable content per number, unique `(templateId, number)`) and `WorkoutTemplateFavorite`. Backfill: every existing template gets an empty version at its current number (they never had content). **`CreateWorkout` reads the version table, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0066_workout_template_versions`
- [ ] Run `e2e/57-catalogo-versionado.spec.ts`

**Rollback**: the commented block at the end of the migration file, then `DELETE FROM "_prisma_migrations" WHERE migration_name = '0066_workout_template_versions';`

---

## SAM-59 — `0067_prescription_drafts_revisions` (additive)

`Workout.supersedesWorkoutId` (self FK RESTRICT, indexed), `amendment`, `revisionReason`, `revisedByUserId`; `WorkoutAssignment.prescriptionVersion` (default 1) and `amendmentWorkoutId`; table `PrescriptionDraft` (coach-only drafts). **Every Workout/WorkoutAssignment read selects the new columns, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0067_prescription_drafts_revisions`
- [ ] Run `e2e/58-rascunho-publicacao.spec.ts` (and 47/57 as regression of the builder)

**Rollback**: the commented block at the end of the migration file, then `DELETE FROM "_prisma_migrations" WHERE migration_name = '0067_prescription_drafts_revisions';`

---

---

## SAM-60 — `0068_assignment_batches` (additive)

Tables `AssignmentBatch` (unique `idempotencyKey`; recipients frozen at publication) and `AssignmentBatchRecipient` (status CHECK PENDING/OK/FAILED/BLOCKED/UNDONE, unique `(batchId, athleteId)`). `AssignWorkoutToTeam` (never called) was removed; the batch publishes each recipient through `PrescribeWorkoutToAthlete`.

- [ ] `prisma migrate deploy`; confirm `0068_assignment_batches`
- [ ] Run `e2e/59-atribuicao-lote.spec.ts` (and 57/58 as regression)

**Rollback**: `DROP TABLE "AssignmentBatchRecipient", "AssignmentBatch"; DELETE FROM "_prisma_migrations" WHERE migration_name = '0068_assignment_batches';`
---

---

## SAM-61 — `0069_session_feedback` (additive)

`AthleteFeedback.rpe` becomes nullable (only when requested) and gains `completion`, `rpeScale`, `rpeCollectedAt`, `difficulty`, `adaptationReason`, `adaptationNote`, `painReported`, `painNote`, `attachmentUrl` (CHECKs); the anchor CHECK now accepts a prescription WITHOUT an execution (partial unique index on `workoutAssignmentId` when `workoutExecutionId IS NULL`); `FollowUpPolicy.syncWindowHours` (default 48). **The athlete/coach detail screens read the new columns, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0069_session_feedback`
- [ ] Run `e2e/60-execucao-feedback.spec.ts` (and 58/59 as regression)

**Rollback**: the commented block at the end of the migration file, then `DELETE FROM "_prisma_migrations" WHERE migration_name = '0069_session_feedback';`
---

## SAM-62 — `0070_auditable_matching` (additive)

`WorkoutExecution` gains `matchDetail` (JSONB: dimensions, weights, facts, algorithm), `matchMethod` (CHECK AUTO/ATHLETE/COACH/MANUAL_ENTRY/STRUCTURED_ID), `matchedByUserId`, `unlinkedAt`/`unlinkedByUserId`/`unlinkReason` (undo keeps the row; CHECK: unlinked ⇒ NO_MATCH) and `providerRemovedAt`. **The prescription detail screens and the matching writers use the new columns, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0070_auditable_matching`
- [ ] Run `e2e/61-associacao-auditavel.spec.ts` (and 60 as regression)

**Rollback**: the commented block at the end of the migration file, then `DELETE FROM "_prisma_migrations" WHERE migration_name = '0070_auditable_matching';`
---

## SAM-63 — `0071_session_load_method` (additive)

`FollowUpPolicy.sessionLoadMethod` (VARCHAR(10), CHECK `SRPE` or NULL): the training-load method the organization chose; sRPE (duration × session RPE, CR10) appears only when chosen. **The hub overview, the prescription detail and "Prazos e lembretes" read it, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0071_session_load_method`
- [ ] Run `e2e/62-comparativo-sessao-semana.spec.ts` (and 60/61 as regression)

**Rollback**: the commented block at the end of the migration file, then `DELETE FROM "_prisma_migrations" WHERE migration_name = '0071_session_load_method';`
---

## SAM-64 — `0072_coach_review` (additive)

New tables `CoachReview` (target ASSIGNMENT | PREPARATION with CHECK, observation, decision CHECK KEEP/ADAPT_FUTURE/RENEGOTIATE_GOAL/MILESTONE_DECISION/NONE, justification, nextReviewLocalDate, linkedAssignmentIds, isVisible, version; partial unique index — one current review per prescription) and `CoachReviewRevision` (previous content on edit); enum value `UserNotificationKind.REVIEW_DUE`. **The prescription detail screens and the coach's workouts list read the new table, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0072_coach_review`
- [ ] Run `e2e/63-revisao-professor.spec.ts` (and 61/62 as regression)

**Rollback**: the commented block at the end of the migration file (the enum value stays), then `DELETE FROM "_prisma_migrations" WHERE migration_name = '0072_coach_review';`
---

## SAM-65 — `0073_open_water_session` (additive)

`Workout.sessionContext` (JSONB: open-water course, environment, expected conditions with provenance, responsible, support plan and signals, equipment, cancellation criterion, distance estimate, briefing — part of the immutable version) and `AthleteFeedback.technical` (JSONB: orientation, environmental difficulty, confidence, equipment, observed conditions, feeding, incident). **Every Workout read selects the new column, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0073_open_water_session`
- [ ] Run `e2e/64-aguas-abertas.spec.ts` (and 62/63 as regression)

**Rollback**: the commented block at the end of the migration file, then `DELETE FROM "_prisma_migrations" WHERE migration_name = '0073_open_water_session';`
---

## SAM-66 — `0074_participation_result` (additive)

New table `ParticipationResult` (one per participation = one prova): status CHECK FINISHED/DNS/DNF/DSQ/EVENT_CANCELLED/PENDING, official time with source and reported time (finish times only for FINISHED/DSQ — CHECK), placement, category, splits (JSONB), abandon segment/reason (only DNF — CHECK), feeding, strategy, day conditions, official link, athlete perception. **The athlete's "Resultados" tab and the coach's event screen read it, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0074_participation_result`
- [ ] Run `e2e/65-resultado-evento.spec.ts`

**Rollback**: the commented block at the end of the migration file, then `DELETE FROM "_prisma_migrations" WHERE migration_name = '0074_participation_result';`
---

## SAM-68 — `0075_collaborator_discipline` (additive)

`CoachAthleteAssignment.discipline` (VARCHAR(60), CHECK: a primary link has no discipline): non-primary links are collaborators, optionally by discipline (§16.4, §22.7). **Every CoachAthleteAssignment read selects the new column, so apply before deploying the code.**

- [ ] `prisma migrate deploy`; confirm `0075_collaborator_discipline`
- [ ] Run `e2e/67-escola-acompanhamentos.spec.ts`

**Rollback**: the commented block at the end of the migration file, then `DELETE FROM "_prisma_migrations" WHERE migration_name = '0075_collaborator_discipline';`
---

### 0076_assessments_zone_profiles (SAM-70)

- Creates `AthleteAssessment` (protocol, assessor, conditions, source, limitations, next review; scope CHECK `schoolId IS NOT NULL OR coachId IS NOT NULL`; reference/source CHECKs), `ZoneProfile` (owner coach, family, reference) and `ZoneProfileVersion` (immutable bounds, unique `(profileId, version)`).
- Adds `AthleteTechnicalSheet.zoneProfileVersions` (JSONB, nullable — absent = derived default) and `AthleteTechnicalSheetRevision.assessmentId` (FK SET NULL).
- Additive only; no backfill. Existing sheets keep the derived zones.
- Rollback: commented at the end of the migration file (drop FK/columns, then the three tables).
## Contacts

| Role | Contact |
|---|---|
| DB admin | (fill in) |
| On-call engineer | (fill in) |
| Product owner | (fill in) |
