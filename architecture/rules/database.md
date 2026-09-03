# Database rules

- Prisma schema is the source of truth.
- Migrations must follow schema-first evolution.
- Review migration history before changing existing models.
- Destructive changes need explicit data-impact analysis.
- Nullable vs required fields must be chosen with downstream flows in mind.
- Unique keys and relations must be checked against queries, jobs, and routes.
- Provider-specific persistence must not leak into canonical models without a clear boundary.

## Impact reminders

- Schema changes can affect auth, activities, reports, integrations, jobs, and admin surfaces.
- Backfills may be needed when data shape changes.

## Test reminder

- Validate the closest schema, repository, and integration tests after a migration-related change.