# ryvano — Documento Arquitetural End-to-End

> Plataforma de acompanhamento esportivo que conecta wearables (Garmin), organiza
> atividades e métricas fisiológicas, e entrega relatórios via WhatsApp.
> Monólito modular full-stack em **Next.js 16 (App Router)** + **Prisma** +
> **PostgreSQL**, com Garmin e Evolution/WhatsApp como serviços externos.

---

## 0. Stack e visão de 10.000 pés

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16.3 (App Router, `output: standalone`), React 19 |
| Linguagem | TypeScript 5 (strict) |
| Auth | NextAuth v4 (`@next-auth/prisma-adapter`), sessão **database** |
| ORM / DB | Prisma 6 + PostgreSQL 16 |
| Hash de senha | Argon2id (`@node-rs/argon2`) |
| Crypto secrets | AES-256-GCM (Node `crypto`) |
| HTTP externo | axios (`validateStatus: () => true`, timeout 15s / 60s Garmin) |
| Validação | Zod 4 |
| Geração de imagem (relatórios) | `next/og` (`ImageResponse`) + `sharp` |
| Gráficos | `d3-scale`, `d3-shape` |
| UI motion / ícones | `motion`, `@tabler/icons-react`, `@iconify/react`, Tailwind 4 |
| Testes | Vitest |
| Deploy | Docker Compose (app + postgres + evolution opcional), migrations no boot |

```text
                         Browser (mobile-first)
                                │
        ┌───────────────────────┴────────────────────────┐
        │                  Next.js (standalone)            │
        │  App Router (RSC) · Server Actions · API Routes  │
        │  Auth (NextAuth) · Application Services · Domain │
        │            Provider Adapters                     │
        │      ┌─────────────┬─────────────┬────────────┐  │
        │      │  Garmin     │  Evolution  │  Send API   │ │
        │      └──────┬──────┴──────┬──────┴──────┬─────┘  │
        │             │  Prisma     │             │        │
        └─────────────┼─────────────┼─────────────┼────────┘
                      │             │             │
                 PostgreSQL   Evolution API   Send/Resend
                                   │           (email)
             Garmin Service  ◄─────┘ (WhatsApp via Baileys)
             (proxy externo :8001)
                      ▲
                      │  cron externo (1/min) → GET /api/integrations/garmin/jobs
```

O sistema tem **três superfícies HTTP de entrada**:
1. **UI autenticada** (`/app/*`, `/onboarding`, `/admin/*`) — RSC + Server Actions.
2. **API Routes** (`/api/*`) — health, webhooks, job Garmin, avatar, exports.
3. **Webhook Evolution** (`/api/webhooks/evolution`) — inbound do WhatsApp.

E **um driver de automação**: o cron externo que bate no endpoint de jobs Garmin.

---

## 1. Jornada do Usuário

`landing → cadastro → onboarding → dashboard → uso diário`

### 1.1 Landing (`app/page.tsx`)
- Página pública, indexável (`X-Robots-Tag: index, follow` via `next.config.ts`).
- Hero + "Como funciona" + benefícios + wearables + segurança + CTA.
- `getPublicSession()` / `getPublicAuthenticatedAppHref()` resolvem sessão com
  **timeout de 300ms** (`raceWithFallback`) para não travar o render público se o
  DB estiver lento — se logado, o CTA já aponta para o destino correto.

### 1.2 Cadastro (`app/cadastro` → `signupAction` em `app/actions/auth.ts`)
- Zod (`signupSchema`) valida nome/email/senha.
- Rate limit `signup`: **5 tentativas / 15 min** por email (`assertRateLimit`).
- Cria `User` + `UserProfile` + `Address` + `NotificationPreference` (scaffold)
  numa transação implícita, `status: ACTIVE`, `passwordHash` Argon2id.
- `createDatabaseSession(userId)` cria sessão e **redireciona para `/onboarding`**.
- Alternativa: **Google OAuth** (`components/auth/google-sign-in-button.tsx`),
  habilitado só se `GOOGLE_CLIENT_ID/SECRET` presentes (`hasGoogleOAuthEnv`).

### 1.3 Onboarding (`app/onboarding/page.tsx`, `components/profile/onboarding-wizard.tsx`)
- Stepper: Conta → Dados pessoais (CPF, telefone, altura, peso) → Endereço →
  Garmin → WhatsApp.
- Gate de conclusão: `isOnboardingComplete()` (`server/users/onboarding.ts`) baseado
  em `UserProfile.onboardingCompletedAt`.
- Guard `requireOnboardedSession()` redireciona `/onboarding` se incompleto.

### 1.4 Dashboard (`app/app/dashboard/page.tsx` → `components/dashboard/dashboard-redesign.tsx`)
- Server Component `force-dynamic`. Chama `getDashboardData(userId, days)`
  (`server/queries.ts`) — período selecionável 7/30/90/365 dias via `?days=`.
- Agrega: tendência por buckets (dia/semana/mês conforme período), última atividade,
  status Garmin, snapshot Garmin do dia, identidade WhatsApp, alertas contextuais
  (Garmin desconectado, reconexão necessária, WhatsApp não ativado, X dias sem
  atividade). Layout de cards persistido em `UserProfile.dashboardLayoutOrder` (JSON).

### 1.5 Uso diário
- **Atividades** (`app/app/atividades`, `components/activities/*`) — lista com filtros
  (período, modalidade, provider), detalhe com splits/gráficos quando há dados.
- **Integrações** (`app/app/integracoes`) — conectar/sincronizar/reconectar/desconectar
  Garmin, ativar WhatsApp, preferências de relatório.
- **Relatórios** (`app/app/relatorios`), **Perfil** (`app/app/perfil`), **Segurança**
  (`app/app/seguranca`).
- Navegação: `components/app-shell.tsx` (desktop) + `mobile-dock.tsx` (mobile-first).

**Guards de sessão** (`server/auth-guards.ts`, memoizados com `cache()`):
`requireSession` → `requireOnboardedSession` → `requireUserRecord` →
`requireOnboardedUser` → `requireAdmin`. Regra de roteamento pós-login em
`getAuthenticatedRedirectPath`: ADMIN → `/admin`, onboarding incompleto →
`/onboarding`, senão `/app/dashboard`.

---

## 2. Fluxo de Atividades

`Garmin sync → normalização → storage → visualização → relatório WhatsApp`

### 2.1 Sync (probe leve + sync completo)
`server/services/garmin-service.ts` implementa uma estratégia de **duas fases** para
economizar chamadas caras à Garmin:

1. **Probe leve** (`syncAllGarminUsers` → `garminProvider.getLatestActivity({fresh:true})`):
   busca só a atividade mais recente e compara o `externalId` com
   `WearableConnection.lastSeenActivityExternalId`.
2. **Sync completo** (`syncGarminForUser`) só dispara se `shouldRunGarminSyncForProbe`
   for verdadeiro (id mudou **e** atividade ainda não armazenada). Pagina
   (`GARMIN_PAGE_SIZE=20`, até `GARMIN_MAX_PAGES=10`) via `garminProvider.syncActivities`.

**Cadência adaptativa por conexão** (`getGarminProbeIntervalMs`):
- **fast** `60s`: usuário com WhatsApp verificado + `postActivityReport` + `enabled`.
- **standard** `15min`: demais conexões.
- Erro/rate-limit → **backoff progressivo** `5 / 15 / 30 / 60 min`
  (`GARMIN_PROBE_ERROR_BACKOFF_MS`, indexado por `lastProbeFailureCount`).
- `nextProbeAt` grava o próximo horário elegível; candidatos ordenados por
  "mais atrasado primeiro" (`compareGarminProbePriority`).

### 2.2 Normalização (`server/services/activity-normalizer.ts`)
`normalizeGarminActivity()` mapeia o payload bruto (nomes variados: `activityId/id`,
`durationSeconds/duration/elapsedDuration`, `averageHR/averageHeartRate`, etc.) para o
modelo interno `Activity`, calcula `endedAt` a partir de duração, guarda o payload
completo em `metrics` e `rawPayload` (JSONB). `externalId` obrigatório.

### 2.3 Storage (idempotente)
`prisma.activity.upsert` com chave única **`(provider, externalId, userId)`** — retries
e re-sync **nunca duplicam**. Índice `(userId, startedAt)` para consultas de período.
Baseline `lastSeenActivityExternalId` atualizado ao fim do sync.

### 2.4 Visualização
`getDashboardData` (buckets/tendência) + páginas de atividades. Snapshot fisiológico
do dia via `getGarminDailySnapshotForUser` (`garmin-daily-report.ts`) — sumário, sono,
HRV, readiness — com **cache em memória** (TTL 10 min; 1 min em falha).

### 2.5 Relatório pós-atividade
Ao criar atividade nova, `enqueuePostActivityReport(activityId)` enfileira um
`MessageDelivery` do tipo `POST_ACTIVITY_REPORT:<activityId>` **se** o usuário for
elegível (WhatsApp verificado + preferência ativa). Modos de enfileiramento:
- `all-new`: todas as atividades novas (default no probe/sync automático);
- `latest-recent-new`: só a mais recente dentro de janela de 36h
  (`GARMIN_RECENT_ACTIVITY_REPORT_WINDOW_MS`) — usado na conexão inicial para não
  disparar avalanche de relatórios de histórico;
- `none`.

O conteúdo é **renderizado como imagem PNG** (não texto) via
`lib/reports/generate-report.ts` (`next/og` 1080×1620, fonte Geist, logos embutidos),
a partir de um `ReportRequest` montado pelo `report-builder.ts`
(`buildPostActivityWhatsAppReport`).

---

## 3. Fluxo de Notificações

`preferências → job agendado → report builder → Evolution API → delivery tracking`

### 3.1 Preferências (`NotificationPreference`)
`postActivityReport`, `dailySummary`, `weeklySummary`, `reportTime` (default `18:00`),
`timezone` (default `UTC` no código; schema traz `America/Sao_Paulo` mas
`getDailyReportSchedule` força `UTC` na V1), `enabled`. Editadas em
`saveGarminReportPreferencesAction` (`app/actions/integrations.ts`).

### 3.2 Job agendado (ver §7)
O endpoint `/api/integrations/garmin/jobs` roda, em um único disparo:
`syncAllGarminUsers()` → `enqueueDueDailyGarminSummaries()` → `dispatchPendingWhatsAppDeliveries()`.

### 3.3 Enfileiramento e materialização (`server/services/reporting.ts`)
Tipos de `MessageDelivery` (chave única **`(userId, type)`**):
- `POST_ACTIVITY_REPORT:<id>`
- `DAILY_GARMIN_SUMMARY:<date>` e `GARMIN_DAILY_SYNC_CHECK:<date>`
  (fallback quando o snapshot do dia ainda não tem métricas suficientes)
- `GARMIN_RECONNECT_ALERT:<connectionId>:<reason>:<cooldownWindow>`

`materializeDelivery()` resolve o tipo, valida elegibilidade novamente, monta o
`ReportRequest` e gera a imagem sob demanda no momento do envio.

### 3.4 Report builder (`server/services/report-builder.ts`, `lib/reports/*`)
Separa **conteúdo** de **transporte**. Templates:
`post-activity-report`, `daily-garmin-summary`, `garmin-daily-sync-check`,
`garmin-reconnect`. Renderização em `render-report-element.tsx`.

### 3.5 Envio via Evolution + rate limiting de disparo
`dispatchPendingWhatsAppDeliveries()` aplica governança de volume
(`server/garmin-reporting-settings.ts`, persistido em `AdminAuditLog`):
- `maxMessagesPerRun` (default 3), `delayBetweenMessagesSeconds` (20),
  `maxMessagesPerHour` (24), `maxMessagesPerDay` (150);
- `whatsappDispatchPaused` — pausa global sem parar sync Garmin;
- orçamento = `min(perRun, perHour−sentLastHour, perDay−sentLastDay)`.
- **Lock otimista** por delivery: `reservePendingDelivery` grava
  `externalMessageId = "LOCK:<uuid>"` com TTL 10 min (evita duplo envio concorrente).
- `sendImage` tenta **7 variantes de payload** contra `/message/sendMedia`
  (compatibilidade entre versões da Evolution); `sendText` para texto simples.

### 3.6 Delivery tracking
`MessageDelivery.status`: `PENDING → SENT/FAILED` (+ `DELIVERED`), com
`sentAt/failedAt/errorCode`. Cada envio emite um `IntegrationEvent`
(`WHATSAPP_DELIVERY_SENT|FAILED`) com debug (endpoint, variante, tentativas).
Reenvio: `redeliverWhatsAppDeliveryById` (recria canonical, arquiva o antigo com
sufixo `::RESENT:`), `requeue*`.

---

## 4. Fluxo Admin (`app/admin/*`, guard `requireAdmin`)

Layout `admin/layout.tsx` (nav: Painel, Usuários, WhatsApp, Integrações),
`buildNoIndexMetadata` (noindex). Admin primário promovido automaticamente por email
fixo (`samuelvermeuln@gmail.com`) em `server/auth.ts` (`ensurePrimaryAdmin`).

- **Overview** (`admin/page.tsx`): KPIs — total de usuários, onboarding concluído,
  Garmin conectada, WhatsApp verificado, fila pendente, falhas, enviadas na última
  hora, estado global de disparo.
- **Usuários** (`admin/usuarios`, `[id]`): lista/detalhe, identidade, reconexão Garmin
  manual (`garmin-reconnect-actions.tsx`).
- **WhatsApp** (`admin/whatsapp`): status Evolution, QR Code, reconnect/disconnect,
  teste de mídia (`evolution-media-test-panel.tsx`, `evolution-tools.tsx`).
- **Integrações** (`admin/integracoes`): saúde Garmin/Evolution, config de webhook,
  **settings do job Garmin** (intervalos, tetos, pausa), histórico de mensagens
  (`message-delivery-panel.tsx`), jobs Garmin (`garmin-jobs-panel.tsx`), limpeza de
  histórico (`history-cleanup-panel.tsx`), preview de relatório
  (`whatsapp-report-preview-panel.tsx`).
- Ações server-side em `app/actions/admin.ts` (rate-limited, `requireAdmin`), todas
  gravam `AdminAuditLog`. Export CSV: `app/api/admin/message-deliveries/export`.

---

## 5. Arquitetura Geral (Next.js)

- **App Router / RSC**: páginas em `app/**` são Server Components por padrão; as que
  precisam de dados vivos usam `export const dynamic = "force-dynamic"`. Componentes
  interativos (`"use client"`) em `components/**`.
- **Server Actions** (`app/actions/*.ts`, `"use server"`): mutações de UI (auth,
  integrations, profile, admin, activities, dashboard-layout). Padrão: `requireSession`
  → Zod → rate limit → serviço → `revalidatePath`.
- **API Routes** (`app/api/**/route.ts`): endpoints máquina-a-máquina (health, jobs,
  webhook, avatar, exports, nextauth).
- **Camada de serviço** (`server/services/*`): garmin-service, reporting,
  report-builder, whatsapp-activation, garmin-daily-report, activity-normalizer.
- **Adapters de provider** (`server/providers/{wearables,messaging,email}`):
  isolam SDK/HTTP externos atrás de contratos (`WearableProviderContract`,
  `MessagingProviderContract`, `EmailProviderContract`).
- **Prisma** (`server/db.ts`): cliente único; `queries.ts` centraliza leituras de
  dashboard com `select` tipados.
- **Utilitários** (`lib/*`, `server/utils/*`): http-client axios, format, sports,
  phone (E.164), cpf, token, logger com redaction.

---

## 6. Integrações Externas

### 6.1 Garmin (`server/providers/wearables/garmin.ts`) — proxy service
- Base `GARMIN_SERVICE_BASE_URL` (default `http://host.docker.internal:8001`),
  timeout 60s. **Nunca `NEXT_PUBLIC_*`**.
- Provisionamento de conta: `POST /accounts` com header `X-Admin-Key`
  (`GARMIN_ADMIN_KEY`) → retorna `accountApiKey` (chave por conta).
- Chamadas de dados usam `X-API-Key: <accountApiKey>`: `/activities`,
  `/activities/latest`, `/activities/:id[/details|/splits|/hr-zones|/weather|...]`,
  `/daily-report/:date`, `/accounts/revalidate` (reconnect).
- Erros codificados (`GARMIN_SYNC_401`, `_403`, `_423`, `GARMIN_MFA_REQUIRED`,
  timeouts) → mapeados para revalidação automática ou mensagens amigáveis
  (`mapGarminConnectError`, `mapGarminSyncErrorMessage`).

### 6.2 Evolution API — WhatsApp (`server/providers/messaging/evolution.ts`)
- Base `EVOLUTION_API_BASE_URL`, header `apikey: EVOLUTION_API_KEY`.
- **Auto-provisiona a instância** (`ensureInstanceExists`, 3 variantes de payload de
  criação, integração `WHATSAPP-BAILEYS`) e configura webhook.
- Número operacional **detectado automaticamente** da instância conectada
  (`fetchInstances` → `ownerJid`/`number`), não vem de env.
- `getStatus`, `getConnectQrCode`, `sendText`, `sendImage`, `findIncomingMessages`
  (usado no fallback de ativação), `disconnect` (com espera de desconexão).

### 6.3 Send API — emails (`server/providers/email/send.ts`)
- Endpoint compatível com Resend (`SEND_API_URL`, `SEND_API_KEY`, `SEND_FROM`).
- Único uso atual: **reset de senha** (`server/services/password-reset-email.ts`).
- Sem provider configurado: em dev expõe o link/código localmente; em produção a
  recuperação por email fica indisponível de forma explícita (`hasPasswordResetEmailEnv`).

### 6.4 WhatsApp Activation (double-opt-in) — `server/services/whatsapp-activation.ts`
1. `generateWhatsAppActivation`: invalida tokens abertos, gera token CSPRNG,
   salva **só o hash**, monta `wa.me/<numeroRyvano>?text=...código...`, TTL 15 min.
2. Usuário envia a mensagem → Evolution → `POST /api/webhooks/evolution`.
3. `verifyWhatsAppActivation`: extrai token do corpo, lookup por hash, valida
   expiry/consumido, **confere que o telefone do sender bate com o cadastrado**,
   consome (single-use), cria/atualiza `WhatsAppIdentity` como `VERIFIED`.
4. Fallback ativo: `findIncomingMessages` varre mensagens recentes se o webhook falhar.
   A identidade **só é verificada** por mensagem que chega pela Evolution — nunca pelo
   telefone digitado no formulário.

---

## 7. Jobs e Automação

**Endpoint único** `GET|POST /api/integrations/garmin/jobs`
(`app/api/integrations/garmin/jobs/route.ts`, `force-dynamic`):
- Auth: `Authorization: Bearer <GARMIN_ADMIN_KEY>` ou header `x-admin-key`.
- Respeita `jobIntervalMinutes` (default 1 min) — retorna `skipped` se ainda não venceu
  (`getGarminJobRunSchedule` lê o último `IntegrationEvent JOB_RUN_SUCCESS`); `?force=1`
  ignora o intervalo.
- Executa: `syncAllGarminUsers()` (probe/sync adaptativo) →
  `enqueueDueDailyGarminSummaries()` (resumos diários vencidos por `reportTime`) →
  `dispatchPendingWhatsAppDeliveries()` (envio respeitando tetos/pausa).
- Registra `IntegrationEvent (GARMIN / JOB_RUN_SUCCESS)` com os resumos.

**Driver**: cron de sistema a cada 1 min (exemplo no README):
```bash
* * * * * curl -fsS http://localhost:3000/api/integrations/garmin/jobs \
  -H "Authorization: Bearer SEU_GARMIN_ADMIN_KEY"
```
Sem esse cron ativo, só há sync na conexão inicial ou disparo manual. Tudo roda
**server-side** (nunca polling pelo browser).

---

## 8. Segurança

- **Encryption de secrets** (`server/crypto/secret-vault.ts`): AES-256-GCM,
  chave derivada de `DATA_ENCRYPTION_KEY` (SHA-256), **nonce único por valor**,
  `authTag`, `keyVersion` para rotação futura. Credenciais Garmin (email, senha) e
  a account API key ficam em `WearableSecret` (nunca plaintext, nunca logadas).
- **CPF**: `cpfEncrypted` + `cpfHash` (`@unique`) para lookup determinístico sem expor
  o valor.
- **Password hashing**: Argon2id (`server/crypto/password.ts`).
- **Rate limiting** (`server/rate-limit.ts`): buckets persistidos em `RateLimitBucket`
  via transação `Serializable` com retry (P2002/P2034). Aplicado a login (10/15min),
  signup (5/15min), reset (5–8/15min), garmin-connect (5/10min), sync, activation, etc.
- **Autorização**: sempre server-side (`requireAdmin` em layout + cada ação admin).
  Esconder item de menu não substitui checagem.
- **CORS / superfície**: não há API pública cross-origin; API Routes são
  máquina-a-máquina (bearer) ou mesma-origem (Server Actions).
- **CSRF**: mitigado pelo modelo Server Actions do Next (tokens de ação) + sessão
  database via cookie; o job e o webhook usam **bearer/secret** próprios em vez de
  cookie de sessão.
- **Webhook security** (`/api/webhooks/evolution`): valida `EVOLUTION_WEBHOOK_SECRET`
  (header `x-webhook-secret`/`authorization`), limite de corpo (64 KB), **dedupe** por
  `IntegrationEvent (provider,eventType,externalId)` único, responde rápido, mascara
  sender e sanitiza o código nos logs.
- **Logs com redaction** (`server/logging/logger.ts`): redige `password`, `token`,
  `secret`, `authorization`, `cookie`, `cpf`, `apiKey`, `access_token`, etc.
  (profundidade máx. 8, proteção contra ciclos). Nenhum secret em `NEXT_PUBLIC_*`.
- **Headers** (`next.config.ts`): `X-Robots-Tag` por rota (noindex em áreas privadas),
  cache de discovery.
- **Env validado no startup** com Zod (`server/env.ts`); `requireEnv` falha claramente.

---

## 9. Deploy

- **Dockerfile** multi-stage (`node:22-bookworm-slim`): deps → builder
  (`prisma generate` + `next build`) → runner (Next standalone + `node_modules`
  completos para o Prisma CLI). Entrypoint roda **`prisma migrate deploy` antes de
  `server.js`** — migrations automáticas no boot, sem serviço one-shot separado
  (padrão compatível com Dokploy).
- **docker-compose.yml**: `app` (porta host `19595`→`3000`) depende de `postgres 16`
  saudável; `evolution` opcional via profile `whatsapp`. `DATABASE_URL` pode apontar
  para banco local do compose ou externo.
- **Migrations** (`prisma/migrations`): `0001_init` → `0002_rate_limit_bucket` →
  `0003/0004` (layout order) → `0005_garmin_probe_queue`. `migrate deploy` (não `dev`).
- **Health check** `GET /api/health` (`force-dynamic`): valida config core mínima,
  conectividade PostgreSQL (`SELECT 1`) e flags honestas de integração; retorna 200 só
  se `ready`, senão 503. Usado no `healthcheck` do compose e em `npm run ops:health`
  (`scripts/ops-health.mjs`).
- **CI** (`.github/workflows/ci.yml`): Node 22 → `db:generate` → `lint` → `test`
  (Vitest) → `build`, com cache do `.next`.

---

## 10. Documentação de Specs (`ryvano_specs/`)

| Arquivo | Conteúdo |
|---|---|
| `00_RYVANO_MASTER_PROMPT.md` | Prompt mestre / visão do produto |
| `01_PRODUCT_UX_SPEC.md` | Landing, login, cadastro, onboarding, dashboard, atividades, integrações, admin, navegação, mobile-first |
| `02_TECHNICAL_ARCHITECTURE.md` | Monólito modular, contrato de wearable, normalização, sync idempotente, report service, observabilidade, erros de domínio |
| `03_INTEGRATIONS_GARMIN_WHATSAPP.md` | Garmin proxy, connect/sync/disconnect, Evolution, QR admin, webhook, activation token, verificação de sender, polling |
| `04_DATA_SECURITY_AUTH.md` | Classificação de dados, modelo Prisma conceitual, auth, roles, AES-256-GCM, Argon2id, webhook security, LGPD |
| `05_ACCEPTANCE_CRITERIA_ROADMAP.md` | Critérios de aceite / roadmap |
| `GARMIN_API_CONSUMPTION_PLAN.md` | Plano de consumo da API Garmin |
| `POST_ACTIVITY_REPORT_TEMPLATE_STANDARD.md` | Padrão do template de relatório pós-atividade |
| `IMPLEMENTATION_TRACKER.md`, `SPEC_IMPLEMENTATION_AUDIT.md`, `VALIDATION_RUNBOOK.md` | Rastreamento, auditoria e runbook de validação |

As specs foram, na maior parte, **implementadas fielmente**: contrato de provider,
normalização com unique `(provider,externalId,userId)`, secret vault AES-256-GCM,
Argon2id, double-opt-in de WhatsApp por webhook, admin server-side com auditoria,
health/readiness honesto. Divergência notável: `timezone` de relatório é forçado a
`UTC` na V1 (o schema default `America/Sao_Paulo` não é usado por `getDailyReportSchedule`).

---

## 11. Modelo de Dados (resumo)

`User` (role/status) ─1:1→ `UserProfile`, `Address`, `NotificationPreference`,
`WhatsAppIdentity`; ─1:N→ `WearableConnection` (─1:N `WearableSecret`, `Activity`),
`Activity`, `MessageDelivery` (unique `userId,type`), `WhatsAppActivationToken`,
`IntegrationEvent` (unique `provider,eventType,externalId`), `PasswordResetToken`,
`AdminAuditLog`. Auth NextAuth: `Account`, `Session`, `VerificationToken`.
Operacional: `RateLimitBucket`.

Enums: `Role`, `UserStatus`, `WearableProvider` (GARMIN + futuros), `ConnectionStatus`
(CONNECTED/DISCONNECTED/SYNCING/ERROR/RECONNECT_REQUIRED), `SecretType`, `Channel`
(WHATSAPP), `DeliveryStatus` (PENDING/SENT/DELIVERED/FAILED).

---

## 12. Como tudo se conecta (sequências-chave)

**Conectar Garmin (`connectGarminAction`)**
```
UI form → requireSession → Zod → rate limit → connectGarminForUser
  → garminProvider.connect (POST /accounts, X-Admin-Key)
  → upsert WearableConnection + encrypt secrets (email/senha/apiKey)
  → syncGarminForUser(mode=latest-recent-new)
  → dispatchPendingWhatsAppDeliveries(maxMessages=1)
  → revalidatePath(/integracoes,/dashboard,/atividades)
```

**Ciclo do job (cron 1/min)**
```
cron → GET /jobs (Bearer) → schedule.due?
  → syncAllGarminUsers: probe latest → mudou? sync completo → upsert Activity
       → enqueuePostActivityReport (se elegível)
  → enqueueDueDailyGarminSummaries (reportTime vencido → DAILY_GARMIN_SUMMARY|SYNC_CHECK)
  → dispatchPendingWhatsAppDeliveries: budget/lock → materialize → generateReport(PNG)
       → evolutionProvider.sendImage → MessageDelivery SENT/FAILED + IntegrationEvent
  → IntegrationEvent JOB_RUN_SUCCESS
```

**Ativar WhatsApp**
```
UI → generateWhatsAppActivationAction → token(hash) + wa.me link (número da instância)
usuário envia msg → Evolution → POST /webhooks/evolution (secret, dedupe)
  → extrai token → verifyWhatsAppActivation (hash lookup, phone match, single-use)
  → WhatsAppIdentity VERIFIED → habilita cadência fast + relatórios
```

**Reconexão Garmin**
```
sync/probe erro 401/403/423 → revalidateGarminConnection (/accounts/revalidate)
  ok? volta a sincronizar : markGarminReconnectRequired
       → status RECONNECT_REQUIRED + enqueueGarminReconnectReport (cooldown 5min)
       → alerta PNG no WhatsApp com link de revalidação (ou recuperação de senha se conta bloqueada)
```
