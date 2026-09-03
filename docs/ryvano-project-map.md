# Ryvano project map

Use this document as the first lookup for any new Ryvano request.
It is intentionally compact: read only the section relevant to the task.

## How to use this map

1. Identify the task category.
2. Read the matching quick index below.
3. Open only the listed surface/module files.
4. For cross-cutting changes, read the shared core section first.
5. Keep responses short unless the user explicitly asks for detail.

## Quick index

- **login / auth** → auth flow, access rules, session helpers
- **pages / telas** → page rules, route guards, admin surface
- **database / migrations** → Prisma schema, migration workflow, envs
- **Garmin** → Garmin module, Garmin API routes, daily jobs
- **Strava** → Strava module, Strava API routes, webhook/jobs
- **shared module rules** → shared integrations, activities, reports
- **WhatsApp / Evolution** → activation, webhook, delivery engine
- **jobs / rotinas** → integration jobs, report delivery, cleanup
- **security** → guards, rate limit, secret vault, env validation
- **tests** → area-specific checklist at the end

## Core architecture

- **App router:** `app/**`
- **Shared domain/core:** `modules/shared/**`
- **Providers:** `modules/garmin/**`, `modules/strava/**`
- **Server logic:** `server/**`
- **Persistence:** `prisma/**`
- **Operational routes:** `app/api/**`
- **UI composition:** `components/**`, `lib/**`

## Shared core rules

### `modules/shared/integrations`

Source of truth for provider capability management.

- **catalog**: provider definitions, availability, auth mode, capabilities
- **capabilities**: canonical capability vocabulary
- **contracts**: provider contracts and context types
- **registry**: resolves provider modules
- **presentation**: integration cards, groups, view models
- **policy**: gates for combine/persist behavior

Rules:
- do not branch on provider identity in shared code when capability lookup exists
- new providers should be added through catalog + module + registry
- routes must stay thin and only adapt HTTP to module calls

### `modules/shared/activities`

Normalization and presentation for activities.

- **sport-types**: canonical `RyvanoSportType`
- **presentation**: visual data for activity detail and dashboard surfaces
- **reconciliation**: cross-provider comparison layer

Rules:
- normalize provider data before UI/domain use
- keep raw provider value separate when needed
- reconciliation is gated and never auto-merges

### `modules/shared/reports`

Report contract and delivery orchestration.

- **contracts**: capability-driven report section rules
- **delivery**: queue, lock, dispatch, transport separation

Rules:
- sections are capability-driven
- delivery must be idempotent and auditable
- real delivery and preview behavior must stay aligned

## Garmin module map

### Main areas

- connect flow
- sync flow
- daily reporting
- disconnect / cleanup
- notifications / reconnect handling
- provider wiring and config

### Typical surfaces

- `modules/garmin/application/connect`
- `modules/garmin/application/sync`
- `modules/garmin/application/daily`
- `modules/garmin/application/reporting`
- `modules/garmin/application/notifications`
- `modules/garmin/infrastructure/provider`
- `modules/garmin/config`
- `app/api/integrations/garmin/**`

### Rules

- keep Garmin protocol details inside the Garmin module
- normalize Garmin payloads before they reach shared UI
- sync and reporting jobs must be idempotent
- reconnect and sync failures must not break other providers

## Strava module map

### Main areas

- OAuth connect / callback
- token exchange / refresh / revoke
- webhook intake and challenge handling
- incremental sync and maintenance jobs
- activity enrichment
- provider wiring and config

### Typical surfaces

- `modules/strava/auth`
- `modules/strava/api/client`
- `modules/strava/api/dto`
- `modules/strava/api/schemas`
- `modules/strava/parsers`
- `modules/strava/webhooks`
- `modules/strava/application/sync`
- `modules/strava/application/jobs`
- `modules/strava/application/cleanup`
- `modules/strava/application/activities`
- `modules/strava/infrastructure/provider`
- `modules/strava/config`
- `app/api/integrations/strava/**`

### Rules

- respect current official Strava docs before changing OAuth, scopes, webhooks, or retention
- keep webhook validation and challenge handling explicit
- token lifecycle operations must remain isolated and secure
- incremental sync jobs must be idempotent

## WhatsApp / Evolution rules

- activation and status are separate concerns
- webhook intake must validate secrets and reject invalid traffic
- delivery must be queue-driven and budgeted
- logs must not expose tokens, secrets, or PII
- admin surfaces must remain operational and noindex

Key surfaces:

- `app/api/whatsapp/activation/**`
- `app/api/webhooks/evolution/route.ts`
- `server/services/reporting.ts`
- `server/evolution-settings.ts`
- related admin pages under `app/admin/whatsapp`

## Auth and access rules

- auth uses the project’s current Next.js + Prisma auth flow
- session enrichment determines role, onboarding, and operational state
- guards must be checked before page or route logic
- admin routes always require admin access
- public pages and app shell must not assume a provider exists

Key surfaces:

- `server/auth.ts`
- `server/auth-session.ts`
- `server/auth-guards.ts`
- `app/actions/auth.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `app/entrar`, `app/cadastro`, `app/onboarding`, `app/app/**`, `app/admin/**`

## Database and migrations

- Prisma schema is the source of truth
- migrations follow schema-first evolution
- schema changes must respect existing relations and operational flows
- avoid changing data shape in multiple layers at once unless required

Key surfaces:

- `prisma/schema.prisma`
- `prisma/migrations/**`
- `server/db.ts`

## Environments and config

- env validation lives in `server/env.ts`
- provider config lives in each module’s `config/`
- Docker/dev services live in `docker-compose.yml`
- secrets should stay in env or secret storage, never in logs or UI

## API route map

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

- keep route handlers thin
- keep provider code isolated
- keep shared code capability-driven
- keep delivery idempotent and auditable
- keep logs free of secrets and PII
- keep admin surfaces operational, not product-facing
- keep app shell usable even with zero integrations

## Test checklist by area

### Auth

- login success and failure
- redirect target by role/onboarding
- blocked or inactive user handling
- session enrichment

### Pages and access

- guard enforcement
- admin noindex and access control
- public vs authenticated shell behavior

### Database

- schema relations
- constraints and unique keys
- migration consistency

### Garmin

- connect, sync, disconnect
- normalization and reporting
- reconnect handling

### Strava

- OAuth flow
- webhook challenge and intake
- token lifecycle
- sync and cleanup jobs

### WhatsApp

- activation and status
- webhook secret validation
- delivery eligibility and queue behavior

### Shared core

- provider catalog and registry
- activity normalization
- reconciliation gating
- report contract gating

## Reading strategy

When in doubt, read in this order:

1. this file
2. the quick index for the task
3. the relevant surface files
4. the provider or route implementation
5. official external docs if the task touches provider contracts
