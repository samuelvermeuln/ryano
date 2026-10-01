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
- **UI / overlays / tema light-dark** → `rules/ui.md` (modal, nunca gaveta lateral; sem cor fixa de superfície)
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
- **school / coaching / athlete history** → `school.yaml`, `app/escola`, `app/professor`, `app/atleta`
- **marketplace / planos de treino** → `marketplace.yaml`, coach studio, checkout, licenses, coach follow-up (extends `school.yaml` — read both)

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
- `POST /api/integrations/strava/sync`
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

### Escola (descoberta pelo atleta — SAM-24)

- `GET /api/schools/search` (nome ou cidade; devolve contagem de atletas)
- `GET /api/schools/[id]/profile` (perfil público + estado do vínculo do visitante)
- `POST /api/schools/[id]/athletes` com corpo opcional `{ shareHistory?, preferredCoachId? }`
- Demais rotas do módulo em `architecture/escola-endpoints.md`

### Professores (descoberta pelo atleta — SAM-25)

- `GET /api/coaches/search?q=` (nome ou e-mail exato; nunca devolve contato)
- `GET /api/coaches/[coachId]/profile` (perfil público + vínculos abertos do visitante)
- `POST /api/coaches/[coachId]/athlete-requests` com corpo opcional `{ schoolId?, shareHistory?, note? }`
- `DELETE /api/coaches/[coachId]/athlete-requests/[assignmentId]` (atleta cancela pedido PENDING)
- `POST /api/coaches/me/athlete-requests/[assignmentId]/accept|reject` (professor decide — SAM-26)
- `POST /api/schools/[id]/athletes/[membershipId]/approve` com corpo opcional `{ coachId? }` (SAM-26)
- Badge de pendências na navegação: `getNavigationCounts` em `server/user-context.ts` → `buildContextNavigation(..., counts)`

### Ações do atleta no treino prescrito (SAM-27)

- `GET|POST /api/workout-assignments/[id]/comments` (conversa atleta ↔ professor; `kind: REVIEW_REQUEST` só do atleta, com execução casada, uma aberta por vez)
- `POST /api/workout-assignments/[id]/absence` com corpo `{ reason? }` (com motivo → `JUSTIFIED`, sem → `MISSED`; só o atleta, só treinos ainda não realizados)
- `POST /api/workout-assignments/[id]/change-request` com corpo `{ reason }` (atleta pede alteração ao professor responsável; mesmo `WorkoutChangeRequest` da escola)
- Quem participa de uma prescrição (atleta, professor dono, OWNER/ADMIN da escola): `resolveWorkoutAssignmentParticipant` em `modules/school/application/workout-assignment-participant.ts`
- Avaliar a execução (`CreateCoachEvaluation`/`UpdateCoachEvaluation`) resolve os pedidos de revisão abertos; tile "Revisões pedidas" em `/professor/[schoolId]`
- Modelo `WorkoutAssignmentComment` (migration `0053`), append-only como `WorkoutAssignmentHistory`

### Perfil público editável (SAM-28)

- Escola: `School.achievements`, `School.specialties`, `School.adminContactUserId` (migration `0054`); `PATCH /api/schools/[id]` aceita também `sportTypes`, `achievements`, `specialties`, `adminContactUserId` (precisa ser OWNER/ADMIN ativo — `SchoolService.update`)
- Professor: `CoachProfile.sportTypes` (RyvanoSportType), `credentials`, `acceptsIndependentAthletes`; `PATCH /api/coaches/me/profile` → `UpdateCoachProfile`
- `GET /api/coaches/search?q=&sport=` filtra por modalidade declarada; `RequestCoachAssignment` recusa pedido independente quando `acceptsIndependentAthletes=false` (409 `COACH_NOT_ACCEPTING_INDEPENDENT`)
- UI: seção "Perfil público" em `/escola/[schoolId]` e "Meu perfil de professor" em `/professor` (modais de edição); modais do atleta mostram conquistas, especialidades, modalidades e credenciais

### Notificações in-app e troca de escola (SAM-29)

- `UserNotification` (migration `0055`) + `NotificationService` em `modules/shared/notifications` — gravada na **mesma transação** do caso de uso (`notify(tx…)`/`notifyMany`); nenhum envio externo dentro do caso de uso (`architecture/escola-domain-events.md`)
- Emissão: `ApproveAthleteMembership`, `RejectAthleteMembership`, `DecideCoachAssignmentRequest`, `RequestCoachAssignment` (→ professor), `RequestSchoolMembership` (→ OWNER/ADMIN), `FulfillWorkoutRequest`/`DeclineWorkoutRequest`, `DecideWorkoutChange`, `CreateCoachEvaluation`, `RemoveCoachFromSchool` (`COACH_LEFT_SCHOOL`), `ApproveCoachSchoolMembership` (`COACH_JOINED_SCHOOL` → `/app/escola?school=<id>&coach=<coachId>`)
- Rotas: `GET /api/notifications?unread=1&limit=`, `POST /api/notifications/[id]/read`, `POST /api/notifications/read-all`, `GET /api/notifications/[id]/open` (marca lida e redireciona ao `href`)
- UI: sino em todos os contextos (`components/notifications-bell.tsx`, via `headerExtra` do `AppShell`), `/app/notificacoes`, item "Notificações" no menu da conta
- "Seguir professor": `/app/escola?school=&coach=` abre o modal com o professor pré-selecionado; `RequestSchoolMembership` aceita `endPreviousCoaching` (grava `reason="moved_with_coach"` no assignment PENDING); `ApproveAthleteMembership` com esse professor encerra o vínculo anterior com ele (independente ou de outra escola)
- `/app/escola` mostra "Recusado" (pedido REJECTED mais recente) e permite pedir de novo

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