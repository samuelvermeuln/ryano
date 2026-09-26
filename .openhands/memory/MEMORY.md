# Ryvano Escola — Project Memory

## Feature flags em produção — causa de 404 em massa (JÁ DIAGNOSTICADO)
`isSchoolModuleEnabled()` (modules/school/config/feature-flag.ts) só auto-habilita
se `NODE_ENV !== "production"` OU `VERCEL_ENV === "preview"`. O container Dokploy
usa `NODE_ENV=production` e não é Vercel ⇒ flag ausente resolve para **false**.
`isMarketplaceEnabled()` depende dela. ~121 call sites; ~80 rotas em `app/`
chamam `notFound()` quando desligado.

**Sintoma enganoso:** HTTP **200**, não 404. Com `loading.tsx` presente o shell
é transmitido antes do `notFound()`. Diagnosticar pelo corpo:
`grep -c 'NEXT_HTTP_ERROR_FALLBACK;404'` (1 = 404 real) e ausência do heading.
Nunca confiar só no status code aqui.

Local sempre funciona porque `.env` tem `SCHOOL_MODULE_ENABLED=true` e o Next
carrega `.env` sozinho — para reproduzir produção é preciso `mv .env` de lado.
`.env` está no `.dockerignore`, então o container depende 100% do compose.
Corrigido em `docker-compose.yml` com default `true` (commit "fix(deploy)").
Desligar só com valor explícito `"false"`; remover a variável religa o bug.
Tests `tests/school-flag.test.ts` fixam "off em produção" de propósito — a
correção é injetar env, NÃO mudar o código.
**VERIFICADO em produção** (commit `694a81f`): antes 404marker=1/heading=0,
depois 404marker=0/heading=1. `/escola`, `/professor` etc. dão 307 → `/entrar`
(auth, comportamento correto — não confundir com falha). Deploy Dokploy ~8min.

## Toolchain
- **npm**, não pnpm. `pnpm-lock.yaml` foi deletado em `fbd4575`; a verdade é
  `package-lock.json` + `.npmrc` (`legacy-peer-deps=true`). Notas antigas que
  citam `pnpm <script>` devem ser lidas como `npm run <script>`.
- Build Docker roda **sem cache** por decisão (`no_cache: true` no compose, sem
  `--mount=type=cache` no Dockerfile): cache persistente fazia produção servir
  build obsoleto. `npm ci` não funciona no container (picomatch multi-versão) —
  usa-se `npm install --legacy-peer-deps`. Ver `2026-09-16.md`.

## E2E Test Patterns (tests/*.test.ts)

### Mock helpers
- `withTx(db)` — wraps a plain mock object with `$transaction: vi.fn().mockImplementation((fn) => fn(db))`. Use whenever the use case calls `this.db.$transaction`.
- `makeOwnerMembership()` — returns `{ id: "owner-mbr-1", userId: IDS.owner, schoolId: IDS.school, status: "ACTIVE", endedAt: null }` for CanManageSchool.

### CanManageSchool / CanManageMembers / CanDeactivateSchool
All three use `SchoolMembershipRepository` → needs both:
1. `schoolMembership.findFirst` (status: "ACTIVE", schoolId+userId match, endedAt: null)
2. `schoolMembershipRole.findMany({ where: { membershipId } })` → array with role OWNER or ADMIN

`CanDeactivateSchool` filters roles to OWNER only.

### SchoolAthleteMembership schema rules (domain/school-athlete-membership.ts)
- PENDING: `startedAt: null, endedAt: null`
- ACTIVE: `startedAt: non-null, endedAt: null, approvedAt: non-null`
- ENDED: `startedAt: non-null, endedAt: non-null` (no constraint on approvedAt)
- REJECTED: `startedAt: null, endedAt: non-null, rejectedAt: non-null`
- REVOKED: `startedAt: non-null, endedAt: non-null, revokedAt: non-null`
- Valid transitions: PENDING→ACTIVE|REJECTED; ACTIVE→ENDED|REVOKED

### CoachAthleteAssignment schema (domain/coach-athlete-assignment.ts)
Required fields: `id, athleteId, coachId, schoolId(nullable), isPrimary, sportType(nullable), status, startedAt(nullable), endedAt(nullable), assignedBy(nullable), endedBy(nullable), createdAt, updatedAt`

### joinSource valid values
`"SCHOOL_INVITE" | "SCHOOL_COACH_INVITE" | "COACH_INVITE" | "MANUAL_SEARCH" | "ADMIN_CREATED" | "MIGRATION"` (NOT "INVITE")

### assignCoachToAthleteInTransaction
Used internally by `AssignCoachToAthlete` AND `ChangeAthleteCoach`. Calls:
1. `CanManageMembers.assert` → needs `schoolMembership.findFirst` + `schoolMembershipRole.findMany`
2. `coachSchoolMembership.findFirst` (active coach)
3. `schoolAthleteMembership.findFirst` (active athlete)
4. `coachAthleteAssignment.findFirst` (findActivePrimaryBySchoolAndAthlete — must return null for new assignment)

When testing ChangeAthleteCoach, make `coachAthleteAssignment.findFirst` dynamic (returns old assignment before update, null after).

### AcceptInvitation
- Calls `invitationLink.findUnique` twice (select: `{id, createdBy}` then full fields via ResolveInvitationLink)
- Calls `invitationUse.findFirst` (replay check)
- For dynamic token matching, capture the created invite in a variable and reference it in findUnique mock

### SchoolService.deactivate
Needs: `$transaction`, `school.findUnique`, `school.findUniqueOrThrow`, `school.updateMany` (sets INACTIVE), `schoolMembership.findFirst+updateMany`, `schoolMembershipRole.findMany`, `schoolAthleteMembership.updateMany`, `coachSchoolMembership.updateMany`, `coachAthleteAssignment.updateMany`, `workoutAssignment.findMany+updateMany`, `workoutAssignmentHistory.createMany`, `adminAuditLog.create`

### Key Implementation Notes
- `makeWorkoutRow()` needs `scheduledDate/scheduledStartAt: NOW` to achieve AUTO_MATCHED score (≥80)
  - Without scheduled dates, composite = ~68 < STRONG_MATCH_THRESHOLD (80) → PENDING
- `CalculateWorkoutCompliance.execute`: throws EXECUTION_NOT_FOUND (not scorable state) when execution is null
- Logging: `schoolLogger(operation)` → per-call instance with auto-generated correlationId
- Security fix: GET /api/workout-assignments requires schoolId + active membership when querying other athlete
- Security fix: GET /api/workout-executions/[id]/evaluation scoped: athlete=visible, coach=own, other=empty

## ARMADILHA: `next build` NÃO pega conflito de slug irmão
Criar `athletes/[athleteId]` ao lado de `athletes/[membershipId]` derruba o
**app inteiro** (500 em toda requisição, não só naquela rota): o roteador lança
ao ordenar a árvore. E `next build` **compila limpo e ainda lista as duas
rotas** — a checagem só roda em tempo de requisição. Build verde não prova que
o roteador sobe. Rodar `next start` + `curl` em algumas rotas antes de publicar.
Guardado por `tests/app-route-slugs.test.ts`. Incidente em produção 2026-09-26,
corrigido em `c009e4c` (a rota era código morto; a tela usa Server Actions).

## Task Status (as of 2026-09-20)
- T367–T368: DONE — feature flag bypass dev/staging
- T400–T406: DONE — TrainingProduct marketplace domain + catalog + purchase + license calendar
- T407: PENDENTE — Integrar plano comprado ao compliance
- T369, T370: PENDENTE — Smoke test staging, flag interno
- Fases 1–7 (dashboard multi-escola, calendário cross-escola, Garmin push): ALL DONE ✓
- Commit: `8601bc4` — "feat(escola/atleta): dashboard multi-escola, calendário semanal, blocos com alvos, Garmin push"
- **1913 tests | tsc clean**
- HEAD atual `364a9e3` (pull de origin/main): onda grande de marketplace com
  Stripe, ledger de vendedor, review/media, layout escola e migrations
  0036–0044. Após esse pull o ambiente local precisa de `npm install`
  (stripe novo) e `db:migrate` antes de valer como verde. Ver `2026-09-16.md`.

## New Routes & Components (2026-09-20)
- `/app/dashboard` — SchoolPanel (multi-escola cards) + WeeklyWorkouts (cross-escola semana)
- `/atleta/semana` — calendário cross-escola com navegação semanal (?week=YYYY-MM-DD)
- `/atleta/[schoolId]/treinos/[assignmentId]` — blocos com alvos, PushToWatchButton
- `POST /api/workout-assignments/:id/push-to-watch` — envia treino ao Garmin (idempotente)

## Garmin Planned Workout Push
- `modules/garmin/application/planned-workout-provider.ts` — GarminPlannedWorkoutProvider
- Usa proxy `GARMIN_SERVICE_BASE_URL` (POST /workouts, DELETE /workouts/:id)
- Sport type map: running=1, swimming=5, cycling=2, strength=20, hiit=211
- Step type map: WARMUP→WARMUP, INTERVAL→INTERVAL, STEADY→ACTIVE, RECOVERY→REST, COOLDOWN→COOLDOWN
- Target: HEART_RATE (hrMin/hrMax), SPEED (de paceSecPerKm ou paceSec100m), POWER, NO_TARGET
- Migration 0033: garminWorkoutId, garminPushStatus, garminPushedAt, garminPushError em WorkoutAssignment

## PlannedWorkoutProvider Contract
- `modules/shared/integrations/contracts/planned-workout.ts`
- Interface provider-agnostic: pushWorkout(input) + deleteWorkout(input)
- Capability: plannedWorkoutPush em ProviderCapabilities
- Garmin é o primeiro provider; Polar/Wahoo entram sem alterar o core

### WorkoutAssignment entity changes (T406)
workoutId + assignedBy NOW NULLABLE. New fields (all nullable): workoutTemplateId, matchStatus, matchedActivityId, matchedAt, matchScore, trainingLicenseId. All createWorkoutAssignment() call sites must supply these. UI pages use `a.workout?.title ?? "Treino agendado"`. match/compliance modules skip null-workout assignments.

### Jornada Escola — Onda 0 turmas (T500–T509, T513) — commit 98934d0
Spec Kiro em `.kiro/specs/ryvano-jornada-escola/` (NÃO GitHub Spec Kit).
`check-status.sh` FALHA se task-list.md e STATUS.md divergirem — rodar antes de
commitar; STATUS.md tem contadores em dois lugares (`Progresso: N/20` e
`Total geral: N/49`). 10/49 concluídas. Defeitos D1–D4 fechados.
- Migration 0035: Team ganha sportType/level/capacity/location/notes (nullable).
  `capacity` é declaração, não CHECK: reduzir abaixo do efetivo é ação legítima.
- `modules/school/application/list-teams.ts`: ListTeams/GetTeamDetail/UpdateTeam.
  UpdateTeam faz PATCH parcial (ausente = não mexer, `null` = limpar).
- 6 rotas em `app/api/schools/[id]/teams/**`; schoolId/teamId vêm SEMPRE da URL,
  nunca do corpo. Telas em `app/escola/[schoolId]/turmas/[teamId]?`.
- `expectedVersion` NÃO implementado em Team (sem coluna `version`; D-04 só
  prevê para AthleteJourney/JourneyMilestone) — divergência anotada no task-list.
- Detalhes e armadilhas (ruído do `prisma format`, verificação de rota por HTTP,
  teste de mutação): ver `2026-09-16.md`.

### TrainingProduct marketplace (T400–T406)
Entities: training-product.ts (schoolId XOR coachId, priceCents+currency pair), training-product-version.ts (planPayload weeks/days), training-purchase.ts, training-license.ts (REVOKED requires revokedAt). ListTrainingProducts use-case + GET /api/training-products (cursor-paginated, defaults PUBLISHED). CreateTrainingPurchase: atomic purchase+license in $transaction. InstantiateLicenseCalendar: idempotent (calendarInstantiated flag), toMonday() anchor, workoutId=null assignments. Migrations: 0030, 0031.


### Telas escola membros/professores + WorkoutChangeRequest (2026-09-25)
Migration 0045 (aditiva): enum `WorkoutChangeRequestStatus` + tabela
`WorkoutChangeRequest` (admin->professor, revisar prescricao JA existente).
NAO reusar `WorkoutRequest` — aquele e atleta->professor e CRIA assignment
via `resultingAssignmentId`; este aponta para um que ja existe.
- **Autoridade dividida** em `DecideWorkoutChange`: professor responde
  (ACKNOWLEDGED/RESOLVED/DECLINED), administracao so CANCELLED (retirar).
  Impede admin "resolver" o proprio pedido sem o professor agir.
- `AddSchoolMember` aceita `userId` XOR `email` (admin nao conhece id
  interno); e-mail normalizado (trim+lowercase); nunca cria conta.
- Rotas novas: `workout-change-requests` (GET/POST + PATCH /[requestId]),
  `coaches/[membershipId]/{prescriptions,report}`, `coach-assignments`,
  `members/[membershipId]`.
- Ultimo acesso: `modules/school/infrastructure/last-access.ts` —
  `Session.expires - 30d`; `at: null` quando nao ha sessao (nao e "nunca").
- **Lint do projeto trata setState-dentro-de-useEffect como ERRO.** Usar
  ajuste de estado durante o render (comparar state anterior via useState).
- **BUG pre-existente NAO corrigido**: `convites/invite-links-panel.tsx`
  monta link com `InvitationLink.id`, mas resolucao e por hash do token
  cru, que nao e persistido -> links copiados sempre 404, irrecuperaveis
  para convites ja criados. Detalhes em `2026-09-25.md`.

### Telas escola com acoes (atletas/turmas/solicitacoes/convites/marketplace) 2026-09-16
- **Fronteira client/server nao e coberta por tsc nem vitest.** Importar um
  helper de um modulo `"use client"` dentro de um Server Component compila,
  passa nos testes e da **500 em runtime**. Helper de apresentacao usado dos
  dois lados vai em `modules/school/presentation/format.ts` (sem diretiva).
  Antes de dar tela por pronta: `npm run build` **ou** requisitar a rota.
- **`audit-access.sh` e a verificacao que paga.** Foi ela que pegou o 500.
  Login e2e: `POST /api/e2e/login`, `owner.alpha@ryvano-e2e.test`/`Teste123!`,
  escola de seed `cmue80z3v003kod8dpb6yt51b`.
- **Lint `react-hooks/purity`**: `Date.now()` no corpo de componente e erro;
  extrair para helper em nivel de modulo.
- **Nao tentar invocar Server Action por curl** - formato RSC custou muito e
  nao rendeu; detalhes do beco sem saida em `2026-09-16.md`.
- Payloads de Server Action -> use case sao `z.strictObject` sobre
  `raw: unknown`: cobertos agora por `tests/school-screen-action-payloads.test.ts`.
  Invariantes: `capacity: 0` rejeitado; gratis e `priceCents: null` (0 e
  rejeitado); `expectedVersion` = `updatedAt` ISO; audiencia aceita `email`.
- Convites: bug do link quebrado **fechado pela raiz** - token bruto so existe
  na criacao, entao e exibido uma unica vez; links antigos sao irrecuperaveis
  por design do hash e a UI parou de prometer o contrario.

### E2E (Playwright) - infra ja existe, NAO criar outra (2026-09-16)
- `e2e/` + `playwright.config.ts`; rodar com `pnpm test:e2e` (precisa do
  `next dev` em :3000; `reuseExistingServer`). Chromium nao vem instalado:
  `npx playwright install chromium --with-deps`.
- **Zero seed de banco**: specs 01-06 criam escola/professor/aluno pela UI,
  idempotentes por e-mail fixo. Dados ficam so em `e2e/fixtures.ts` -
  reutilizar `ESCOLA_1/2`, `PROFESSOR_1..3`, `ALUNOS`, nunca duplicar.
- Helpers em `e2e/helpers.ts`: `ensureUser`, `login`, `completeOnboarding`,
  `getSchoolId`, `loginAsSchoolOwner` (os dois ultimos adicionados agora).
- Specs 07-10 cobrem turmas, convites, atletas e solicitacoes. 51 testes
  passando no total.
- **Regra**: rodar todo spec novo 2x seguidas. A 1a execucao passa por
  acidente; a 2a revela suposicao de estado inicial. Testes devem *convergir*
  para o estado desejado ("ja esta assim" = sucesso, nao falha).
- **Nao usar `test.skip` no caminho principal** - esconde regressao. Usar
  `expect(cond, "msg").toBe(true)`.
- Tela de atletas mostra **historico**: varias linhas por atleta. A linha viva
  e a que tem "Gerenciar" (so renderizado para ACTIVE) - `.first()` pega a
  linha "Desligado" e engana o teste.
- Preferir `getByLabel` (a UI tem aria-labels). Seletor amplo tipo
  `"li, tr, div"` casa com div interna; menu lateral rouba clique por texto.
