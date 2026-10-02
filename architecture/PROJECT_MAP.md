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

- `GET /api/integrations/strava/connect` (`?reauthorize=1` força o consentimento no Strava; usado pelo "Reconectar" quando a conexão está em `RECONNECT_REQUIRED` por `STRAVA_SCOPE_MISSING`/`STRAVA_UNAUTHORIZED`)
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

### Coach independente — central do atleta e transferências (SAM-30, ADR-009)

- Escopo: todo caso de uso professor-atleta recebe `string` (escola) ou `{ kind: "independent" }` (`modules/school/application/coach-athlete-scope.ts` + `resolve-coach-athlete-context.ts`); escopo independente = `{ schoolId: null, coachId }`, nunca `schoolId: null` sozinho
- Hub: `app/professor/_athlete-hub/**` (screens, shell, ações, modais; `hub-scope.ts` gera as URLs) serve `/professor/[schoolId]/atletas/[athleteId]/**` e `/professor/(hub)/independente/atletas/[athleteId]/**` (resumo, treinos, novo, [assignmentId], ficha-tecnica, historico, analise, avaliar). `/professor/independente` linka cada atleta à central
- Atleta: `/app/treinos/[assignmentId]` (prescrição sem escola; sem pedido de alteração, comentários sim); card do calendário e `/atleta/semana` linkam para lá quando há `coachId` e não há escola nem licença
- Transferências (professor propõe, atleta confirma): `proposeTransferAction` → `ProposeAthleteTransfer` (`to-school` = notificação para `/app/escola?school=&coach=`, fluxo SAM-29; `to-independent` = CAA PENDING com `reason = moved_from_school` + notificação `/app/professor?professor=`); `POST /api/coaches/[coachId]/athlete-requests/[assignmentId]/confirm` → `ConfirmTransferToIndependent` (ativa, encerra vínculos de escola do par, avisa OWNER/ADMIN e professor; matrícula fica); recusar = `DELETE` existente. `DecideCoachAssignmentRequest` recusa aceitar a própria proposta e, em pedido `moved_with_coach`, encerra o vínculo anterior (`end-other-coaching-links.ts`, compartilhado com `ApproveAthleteMembership`)
- Migração `0056` (ficha técnica por `(coachId, athleteId)` fora da escola; `CoachEvaluation.schoolId` nulo; índice único do par independente; kinds `COACH_TRANSFER_PROPOSED`/`COACH_TRANSFER_CONFIRMED`) — ver `architecture/escola-migration-checklist.md`

### Matching automático e atividade não planejada (SAM-33)

- Gancho pós-persistência, provider-agnóstico: `modules/school/application/match-persisted-activity.ts` (`matchPersistedActivity(db, activity, { loadDetail })`) — chamado pela sync e pelo webhook do Strava e pela sync do Garmin logo após o upsert da `Activity`; nunca lança; pula atividade que já tem execução (`(athleteId, source, externalId)`, qualquer caixa do source); score forte → `AUTO_MATCHED`, fraco → `PENDING` (atleta confirma), modalidade diferente nunca casa (a atividade fica "não planejada"). Novo provider = chamar o gancho uma vez depois do seu upsert
- Backfill: `scripts/backfill-activity-matching.ts` (`BackfillActivityMatching`, paginado e idempotente)
- Vocabulário prescrito × executado (puro): `modules/school/domain/prescription-outcome.ts` (`PLANNED_NOT_EXECUTED | EXECUTED_AS_PLANNED | EXECUTED_PARTIALLY | EXECUTED_DIFFERENTLY | UNPLANNED_ACTIVITY`, rótulos em `presentation/workout-labels.ts`)
- "Não planejada" tem uma definição só: `modules/school/application/unplanned-activities.ts` (`splitLinkedActivities`, `listUnplannedActivities`); `loadAthleteSessions` lê também as sessões auto-registradas do atleta (`UNPLANNED`, sem escola nem professor) e, antes do período do vínculo, só as datas cobertas pelo consentimento `activities` (`CanReadAthleteHistory.resolver`, usado pelo resumo do professor)
- Fixture E2E `/api/e2e/activity-fixture` aceita `autoMatch` (roda o gancho como uma sync); spec `e2e/40-atividade-nao-planejada.spec.ts`

### Professor abre a atividade do atleta (SAM-34)

- Aba "Atividades" do hub (`hub-scope.ts` → `/professor/[schoolId]/atletas/[athleteId]/atividades[/[activityId]]` e o espelho independente): `GetCoachAthleteActivities` (importadas + auto-registradas, janela/origem/modalidade/página na URL, resultado prescrito × executado por item, prescrição de outro vínculo não é exibida, `withheldBeforePeriod` por consentimento) e `GetCoachAthleteActivityDetail` (404 sem vazar existência; enricher injetado na camada app)
- `components/activities/activity-detail-view.tsx` é a MESMA visão de `/app/atividades/[id]`; `ActivityVisualDashboard` ganhou `layoutEditable` — só o atleta dono salva layout
- Links cruzados: detalhe da prescrição → atividade importada; detalhe da atividade → prescrição; resumo "sessões sem prescrição" → aba Atividades filtrada

### "Meus atletas" do coach independente (SAM-35)

- Um plantel para os dois escopos: `app/professor/_athlete-hub/roster.ts` (`loadCoachRoster(db, { coachId, scope, timeZone })` — só vínculos ACTIVE; fatos de prescrição no escopo exato `{ schoolId }` / `{ schoolId: null, coachId }`; última atividade, atividade hoje, prescrição de hoje com resultado prescrito × executado, não planejada hoje) + `roster-panel.tsx` (cards, filtros "Treinaram hoje", ordenação "Última atividade", href por `hubBasePath`) + `roster-screen.tsx`
- Rotas: `/professor/[schoolId]/atletas` (refatorada para o loader) e `/professor/independente/atletas` (nova); sidebar do hub do professor (`lib/user-context.ts`, escopo default) ganha "Meus atletas" → `/professor/independente/atletas`; `hubCrumb` do escopo independente aponta para lá; `/professor/independente` mantém convites/encerrar e linka a lista
- Correção herdada: `/professor/[schoolId]` (painel) e `/atleta/[schoolId]` ("Seu professor") filtravam só `endedAt: null` e tratavam pedido PENDING como vínculo; agora `status: "ACTIVE"`

### Calendário do professor — prescrito × executado (SAM-36)

- `GetCoachWeeklyAgenda.execute(actor, scope, { weekStart, weeks, teamId, athleteId, sportType, withoutCoach, kinds })` por escopo: escola como antes (admin vê a escola inteira; fuso `School.timezone`); independente = atletas com vínculo ACTIVE do professor, fuso do próprio professor (`resolveAthleteTimeZone`). Cada prescrição carrega o resultado prescrito × executado (execução casada); atividades importadas sem execução e sessões auto-registradas são itens `unplanned-import` / `unplanned-self` (`modules/school/presentation/weekly-agenda.ts`: `AgendaItem.kind`, `summarizeAgendaItems` = totais do período em que só o que aconteceu conta como volume)
- UI compartilhada `app/professor/_agenda/{agenda-screen,agenda-slot,agenda-paths,actions}` servindo `/professor/[schoolId]/agenda` e `/professor/independente/calendario` (sidebar "Calendário"); semana (`semana=YYYY-Www`) e mês (`visao=mes&mes=YYYY-MM`, até 6 semanas numa janela só); filtro `tipo=prescricao|nao-planejada`; chips `data-kind=prescription|mixed|unplanned`, entradas `data-kind` com link para a prescrição ou para a atividade (SAM-34)
- `RescheduleWorkout` fora da escola usa o fuso do atleta (`resolveAthleteTimeZone`) em vez de `America/Sao_Paulo` fixo

### Escola abre as atividades do atleta (SAM-37)

- `modules/school/application/activity-reader-context.ts`: `ResolveActivityReaderContext` resolve quem lê atividades — professor (escola/independente via `ResolveCoachAthleteContext`) ou administração (`{ kind: "school-admin", schoolId }` via `CanManageMembers` + matrícula ACTIVE, `periodStart` da matrícula); `GetCoachAthleteActivities` e `GetCoachAthleteActivityDetail` aceitam os três escopos; `isPrescriptionOfReader` decide "prescrição deste vínculo" (escola: `schoolId`; independente: `coachId` com `schoolId` nulo; administração não vê prescrições de outro vínculo como suas)
- Rotas `/escola/[schoolId]/atletas/[athleteId]/atividades[/[activityId]]` (link "Ver atividades" na ficha); lista compartilhada `components/activities/athlete-activities-list.tsx` + filtros/paginação exportados de `app/professor/_athlete-hub/activities-screen.tsx`; detalhe = `ActivityDetailView` read-only; `/escola/[schoolId]/atletas` mostra "+N não planejada(s)" na coluna Semana
- Fora do escopo desta entrega (follow-up explícito): calendário da escola por professor e "Execuções recentes" do painel com não planejadas

### Contrato canônico e resolução de fonte (SAM-45, ADR-005)

- `modules/shared/activities/contracts/rich.ts` (reexportado por `contracts/index.ts`): `NormalizedActivityDetail` (voltas, conjuntos de zonas nativas/derivadas, séries esparsas com lacunas, estatísticas estendidas, `sources` por bloco), `NormalizedDailyHealth` (dia local; FC de repouso, energia proprietária rotulada, sono e fases, VFC, prontidão, passos), `SessionFingerprint`; Zod; ausência ≠ zero
- Catálogo (`modules/shared/integrations/catalog`): capabilities finas por provider (`nativeHeartRateZones`, `routeGps`, `swimMetrics`, `trainingEffect`, `bodyBattery`, `temperature`, `calorieBreakdown`, `dailyHealth`, `restingHeartRate`, `steps`); `AMAZFIT` (Zepp) como `COMING_SOON` (`ProviderId`, política padrão, visual); contratos `ActivityDetailProvider` / `DailyHealthProvider` em `ProviderModule`; `findCapabilityContractViolations` + `registry/capability-contract.test.ts`
- `modules/shared/activities/source-resolution`: `resolveActivityDetailSources` (combinação desligada = tudo da conexão primária; liberada = melhor fonte por bloco, rotulada), `resolveDailyHealthSources` (uma conexão por campo), `findDuplicateSessions` (mesma sessão em duas conexões), `rankProviders` (preferência do atleta → ordem do catálogo). Puro; consumido por SAM-38/39/40/42/43

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