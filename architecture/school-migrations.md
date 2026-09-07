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
