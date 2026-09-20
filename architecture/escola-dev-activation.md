# Escola Module — Dev Activation Checklist (T367)

Steps to activate the Escola module in a local dev environment.
For staging/production, follow the full [migration checklist](escola-migration-checklist.md).

---

## Prerequisites

- [ ] PostgreSQL running locally (or Docker: `docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:15`)
- [ ] `DATABASE_URL` set in `.env.local`
- [ ] `AUTH_SECRET` set in `.env.local` (any random string in dev)
- [ ] Prisma client generated: `pnpm db:generate`

## 1. Apply migrations

```bash
pnpm db:migrate
# Applies all 0001–0029 migrations to the local DB.
```

Verify:
```bash
# Should show 0029_t316_indexes at the top with finished_at set
psql $DATABASE_URL -c "SELECT migration_name, finished_at FROM \"_prisma_migrations\" ORDER BY finished_at DESC LIMIT 5;"
```

## 2. Enable the feature flag

Add to `.env.local`:

```env
SCHOOL_MODULE_ENABLED=true
```

## 3. Run the dev seed

```bash
pnpm db:seed
```

This creates:
- School: **Academia Ryvano (Dev)**
- Owner: `owner@ryvano.dev`
- Admin: `admin@ryvano.dev`
- Coaches: `coach1@ryvano.dev`, `coach2@ryvano.dev`, `coach3@ryvano.dev`
- Active athletes: `athlete1–5@ryvano.dev`
- Lobby athletes: `lobby1–2@ryvano.dev` (PENDING)
- Workout templates, assignments, executions, compliance records
- Two invitation links (tokens printed to stdout — save them)

The seed is **idempotent** — safe to re-run.

## 4. Start the dev server

```bash
pnpm dev
```

## 5. Manual smoke tests

| Test | Expected |
|---|---|
| `GET /api/schools/search?q=academia` | 200, returns Academia Ryvano (Dev) |
| `POST /api/schools` (authenticated) | 201, creates a new school |
| `GET /api/workout-assignments` (as athlete1) | 200, returns assignments |
| `GET /api/schools/[id]/athletes` (as owner) | 200, lists athlete memberships |
| `GET /api/schools/[id]/lobby` (as owner) | 200, lists 2 pending athletes |
| `GET /api/schools/[id]/audit-logs` (as owner) | 200, returns audit log |
| Use invitation token from seed | Accepts and creates membership |

## 6. Verify observability

Check that structured logs appear in the dev console:
```
schoolLogger: level=info operation=approve_athlete_membership status=success ...
```

## Troubleshooting

| Error | Fix |
|---|---|
| `SCHOOL_MODULE_DISABLED` (404) | `SCHOOL_MODULE_ENABLED=true` not in `.env.local` or server not restarted |
| `UNAUTHORIZED` (401) | Sign in at `/auth/signin` first |
| `Migration failed: relation not found` | Re-run `pnpm db:migrate` against a fresh DB |
| `P3009 migrate found failed migrations` | Reset with `prisma migrate reset --force` (dev only!) |
