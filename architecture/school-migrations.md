# School core migration — T012

Migration `0009_school_core` is additive. Prisma schema remains the source of truth.

- IDs use the existing opaque String/cuid convention, not a duplicated athlete identity.
- Owner FK uses RESTRICT, including inactive schools: deleting an owner cannot silently erase historical origin.
- Unique slug supports exact lookup. `(ownerUserId,status)` supports owner lists; `(status,name,id)` supports status-filtered ordered lists. Substring name search needs a later query/EXPLAIN review; this B-tree is not claimed to accelerate arbitrary `contains`.
- Timestamps use timestamptz(3); no existing timestamps are changed.
- No existing records are backfilled or modified.

## Rollback evaluation

Do not run a destructive down migration in production. Keep SCHOOL_MODULE_ENABLED disabled, roll back application code and retain the additive table and enums. Once real schools exist, dropping the table would destroy historical origin. Any physical removal requires a separate approved retention/backup procedure and verification that no dependent records exist. No production migration/deploy is authorized by this task.

## Verification

PostgreSQL 18.4 isolated at 127.0.0.1:55439, databases school_dev and school_shadow, synthetic users only. The persistence test requires SCHOOL_TEST_DATABASE_URL explicitly and rejects other hosts, ports and database names. It never uses ambient DATABASE_URL to select the test database.

- Existing eight migrations applied before RED: School table absent (42P01).
- Prisma migrate dev --create-only generated the SQL, renamed to the repository's sequential 0009 convention before application.
- Migration up and Prisma client generation executed.
- Tests verify defaults, unique slug, missing owner, and RESTRICT while school is active and inactive. PostgreSQL 18 returns SQLSTATE 23001 for RESTRICT; Prisma 6 does not map this delete to P2003, so the test checks the raw SQLSTATE through a parameterized statement.
- No provider API is called.

## Membership rollout — T020

`0010_school_memberships` creates the enum, temporal table, indexes and RESTRICT foreign keys. Preserve its originally applied SQL/checksum. `0011_school_membership_pending_started_at_check` adds `SchoolMembership_pending_startedAt_check` (`PENDING` implies `startedAt IS NULL`) without changing existing rows. Invalid existing rows block the migration and require investigation, never automatic correction.

Before deployment, confirm the intended database and schema (`current_database()`, `current_schema()`) using the deployment's configured connection. Inspect `_prisma_migrations` for `0009_school_core`, `0010_school_memberships` and `0011_school_membership_pending_started_at_check`: applied entries must have matching file SHA-256 checksums, `finished_at` populated and `rolled_back_at` null; stop on failed/pending entries or unexplained drift. A fresh database has no migration history or school objects and must receive the full chain.

Expected state follows that history:

- After 0009 only: `School` and its enums exist; `MembershipStatus`, `SchoolMembership` and the membership CHECK are absent.
- After 0010: membership enum/table, primary key, both RESTRICT foreign keys, `SchoolMembership_schoolId_status_idx`, `SchoolMembership_userId_status_idx` and partial unique `SchoolMembership_active_school_user_key` exist; the CHECK is absent. Confirm no row has `status = 'PENDING' AND startedAt IS NOT NULL` before applying 0011.
- After 0011: the same objects remain and the CHECK exists and is validated. An object present without its corresponding migration history is drift; investigate before proceeding.

Keep `SCHOOL_MODULE_ENABLED=false`. Apply forward with the installed Prisma CLI (`prisma migrate deploy`): an existing 0010 database receives 0011; a fresh database receives 0001–0011. Successful migrations are skipped on subsequent deploys through Prisma history; do not replay their SQL manually. Do not use `migrate resolve` to conceal failures or checksum mismatches.

Before 0011, confirm `SchoolMembership` has zero rows, as expected while the feature flag remains disabled. Adding the CHECK validates existing rows immediately and takes an ACCESS EXCLUSIVE table lock. If rows exist, investigate their origin, schedule a low-load maintenance window, configure session `lock_timeout` and `statement_timeout` according to the operational window, and monitor blocking sessions during deployment. A timeout must be investigated as a failed migration before retrying. Keep immediate validation: the invariant must be guaranteed before enabling membership writers.

Afterward, inspect `_prisma_migrations`, `pg_constraint` (`pg_get_constraintdef`, `convalidated`) and `pg_indexes` in the target schema. Confirm the CHECK, both RESTRICT foreign keys, both status indexes and uniqueness restricted to `status = 'ACTIVE'`. Validate the full migration chain and `tests/school-persistence.test.ts` in isolated PostgreSQL, including rejected INSERT and UPDATE with SQLSTATE 23514. Do not create test records in production.

This is a database-first additive rollout compatible with the old application, which has no membership writer. Release the compatible application before enabling the feature. Rollback disables the flag and reverts the application while retaining the table, enum, indexes, constraints and all history; no destructive down migration or data rewrite is part of this rollout.
