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

## Contacts

| Role | Contact |
|---|---|
| DB admin | (fill in) |
| On-call engineer | (fill in) |
| Product owner | (fill in) |
