# Ryvano Project Map

Compact reference for the repo. Read only the section relevant to the current task.

## How to use this map

1. Identify the task category.
2. Open the matching module/rule section.
3. Use GitNexus for symbol-level impact.
4. Inspect only the smallest coherent set of implementation files.
5. Keep responses short unless the user asks for depth.

## Quick index

- **login / auth** → `auth.yaml`, auth guards, sessions, protected routes
- **pages / telas** → page rules, admin surface, route families
- **database / migrations** → `persistence.yaml`, Prisma schema, migrations
- **Garmin** → `garmin.yaml`, Garmin routes, reporting jobs
- **Strava** → `strava.yaml`, OAuth, webhook, sync, cleanup jobs
- **shared integrations** → `shared-integrations.yaml`
- **shared activities** → `shared-activities.yaml`
- **shared reports** → `shared-reports.yaml`
- **WhatsApp / Evolution** → `whatsapp.yaml`, activation, webhook, delivery
- **jobs / rotinas** → provider jobs, reporting dispatch, cleanup
- **security** → `rules/security.md`, env validation, auth guards
- **tests** → `rules/*.md` + repo tests closest to the changed surface

## Core architecture

- **App router:** `app/**`
- **Shared domain/core:** `modules/shared/**`
- **Providers:** `modules/garmin/**`, `modules/strava/**`
- **Server logic:** `server/**`
- **Persistence:** `prisma/**`
- **Operational routes:** `app/api/**`
- **UI composition:** `components/**`, `lib/**`

## Shared integrations

- Provider catalog and capabilities live in `modules/shared/integrations/catalog`.
- Registry and contracts live in `modules/shared/integrations/registry` and `contracts`.
- Shared UI reads presentation view models, not raw provider DTOs.
- Capability checks are preferred over branching on provider name.
- Zero, one, or many providers per user are all valid.

## Shared activities

- `RyvanoSportType` is the canonical sport taxonomy.
- Provider sport values are normalized before shared UI consumption.
- Activity detail, dashboard, and reports consume normalized activity data.
- Reconciliation is explicit and must not auto-merge conflicting records.

## Shared reports

- Report sections are capability-driven.
- Delivery and preview should share the same business rules.
- Delivery must be idempotent and auditable.
- Transport concerns must not redefine report rules.

## Garmin

- Owns Garmin protocol, sync, daily reporting, reconnect handling, and Garmin-specific presentation.
- Garmin failures must not break other providers.
- Sync and reporting jobs must be idempotent.

## Strava

- Owns OAuth, token lifecycle, webhook intake, sync, cleanup, and Strava-specific presentation.
- External contract changes require current official Strava docs.
- Webhook and sync jobs must be isolated and idempotent.

## WhatsApp / Evolution

- Owns activation verification, webhook intake, and report delivery plumbing.
- Secrets and tokens must never be logged.
- Delivery is queue-driven if the current implementation says so; confirm the code before documenting behavior.

## Auth and access

- Sessions, guards, onboarding, and admin access are centralized.
- Admin routes require explicit admin authorization.
- Public and app-shell pages must not assume a provider exists.

## Database and migrations

- Prisma schema is the source of truth.
- Migrations follow schema-first evolution.
- Schema changes require blast-radius review across queries, routes, jobs, and tests.

## APIs

### System / auth

- `GET|POST /api/auth/[...nextauth]`
- `GET /api/health`
- `GET /api/me`
- `GET /api/onboarding/identity-availability`
- `GET|POST /api/profile/avatar`

### Garmin

- `POST /api/integrations/garmin/connect`
- `DELETE /api/integrations/garmin`
- `POST /api/integrations/garmin/sync`
- `GET|POST /api/integrations/garmin/jobs`

### Strava

- `GET /api/integrations/strava/connect`
- `GET /api/integrations/strava/callback`
- `DELETE /api/integrations/strava/disconnect`
- `GET|POST /api/integrations/strava/webhook`
- `GET|POST /api/integrations/strava/jobs`
- `GET|POST /api/integrations/strava/jobs/daily`

### WhatsApp / Evolution

- `POST /api/whatsapp/activation`
- `GET /api/whatsapp/activation/status`
- `DELETE /api/whatsapp/activation/status`
- `POST /api/webhooks/evolution`

### Admin

- `GET /api/admin/message-deliveries/export`
- `GET|POST /api/admin/strava/webhook-subscription`
- `GET|POST /api/admin/whatsapp-reports/preview`

## Surface-to-file guide

### Login / auth

- `server/auth.ts`
- `server/auth-session.ts`
- `server/auth-guards.ts`
- `app/actions/auth.ts`
- `app/entrar/page.tsx`
- `app/cadastro/page.tsx`
- `app/recuperar-senha/page.tsx`
- `app/redefinir-senha/page.tsx`

### Onboarding / profile

- `app/onboarding/page.tsx`
- `app/actions/profile.ts`
- `app/app/perfil/page.tsx`
- `app/app/seguranca/page.tsx`
- `server/validators/profile.ts`

### Dashboard / activities / reports

- `app/app/dashboard/page.tsx`
- `app/app/atividades/page.tsx`
- `app/app/atividades/[id]/page.tsx`
- `app/app/relatorios/page.tsx`
- `modules/shared/activities/**`
- `modules/shared/reports/**`
- `server/queries.ts`

### Integrations UI

- `app/app/integracoes/page.tsx`
- `components/integrations/integrations-hub.tsx`
- `modules/shared/integrations/presentation/**`
- `modules/shared/integrations/catalog/**`
- `modules/shared/integrations/registry/**`

### Admin surfaces

- `app/admin/page.tsx`
- `app/admin/usuarios/page.tsx`
- `app/admin/usuarios/[id]/page.tsx`
- `app/admin/integracoes/page.tsx`
- `app/admin/whatsapp/page.tsx`

## Operational rules

- Keep route handlers thin.
- Keep provider code isolated.
- Keep shared code capability-driven.
- Keep delivery idempotent and auditable.
- Keep logs free of secrets and PII.
- Keep admin surfaces operational, not product-facing.
- Keep the app shell usable even with zero integrations.

## Reading strategy

When in doubt, read in this order:

1. this file
2. the matching module YAML
3. the matching rule file
4. the relevant ADR
5. GitNexus context / impact / detect-changes
6. implementation files

## Compatibility note

`docs/ryvano-project-map.md` is kept only as a compatibility alias. Use this file as the source of truth.