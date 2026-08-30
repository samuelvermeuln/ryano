# Design — Arquitetura Modular de Integrações Esportivas

## Visão geral

Este design descreve como transformar a Ryvano de uma aplicação Garmin-cêntrica
em uma plataforma multi-provider (0..N integrações por usuário), preservando o
comportamento atual do Garmin e adicionando Strava de forma modular. O princípio
condutor é: **provider é plugin, Ryvano é produto**.

A abordagem é incremental e não-destrutiva: primeiro preparamos o core
(catálogo, capabilities, contratos, view-models), depois modularizamos o Garmin
sem mudar comportamento, depois adicionamos Strava (OAuth → API → webhook → UI →
relatórios), e por fim deixamos a reconciliação como camada separada e
desabilitada.

### Stack e restrições técnicas

- Next.js 16.3.1 (App Router), React 19, TypeScript.
- Prisma 6.19 sobre PostgreSQL.
- NextAuth 4, Zod 4, vitest.
- Criptografia de secrets: AES-256-GCM via `server/crypto/secret-vault.ts`
  (`DATA_ENCRYPTION_KEY`).
- Mensageria WhatsApp: `EvolutionProvider` (já abstraído por
  `MessagingProviderContract`).
- Alias de import: `@/` aponta para a raiz do projeto. `modules/` será um novo
  top-level acessível como `@/modules/...` (validar `tsconfig.json`/paths).

### Decisão de nomenclatura de módulos

Adotaremos `modules/` na raiz do projeto (irmão de `app/`, `server/`,
`components/`, `lib/`), conforme o documento de referência (seções 17–21). O
`server/` continua existindo para infraestrutura compartilhada (db, env, crypto,
auth, logging, rate-limit) que não é específica de provider.

---

## Arquitetura

### Diagrama de alto nível

```text
                              RYVANO
                               User
                                │ 0..N
                                ▼
                     WearableConnection (genérica)
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                        ▼
   modules/garmin          modules/strava          futuro (catálogo)
        │                       │
        └───────────┬───────────┘
                    ▼
        modules/shared (contratos, catálogo, capabilities,
        registry, normalização, policy, reconciliation)
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
  Dashboard     Atividades     Relatórios      (app/ + components/)
                    │
                    ▼
        app/api/** (adapters finos)  ──►  server/ (infra compartilhada)
```

### Estrutura de diretórios alvo

```text
modules/
├── shared/
│   ├── integrations/
│   │   ├── catalog/          # PROVIDERS[], ProviderDefinition
│   │   ├── capabilities/     # ProviderCapabilities, helpers hasCapability
│   │   ├── contracts/        # ActivityProvider, RecoveryProvider, ... , registry
│   │   ├── registry/         # providerRegistry: ProviderId -> módulo
│   │   ├── policy/           # ProviderDataPolicy + policy gate
│   │   ├── errors/
│   │   └── types/            # ProviderId, ProviderAvailability, view-models
│   ├── activities/
│   │   ├── contracts/        # NormalizedActivity, ActivitySource
│   │   ├── sport-types/      # RyvanoSportType canônico + helpers
│   │   ├── domain/
│   │   ├── presentation/     # view-models de atividade provider-agnostic
│   │   └── reconciliation/   # BLOQUEADO por padrão
│   └── reports/
│       ├── contracts/        # ReportSectionRequirement (capability)
│       └── presentation/
├── garmin/
│   ├── api/{client,dto,routes,schemas}
│   ├── application/{connect,disconnect,sync,activities,daily,recovery,notifications}
│   ├── config/               # env.ts (Garmin)
│   ├── domain/{entities,types,errors}
│   ├── infrastructure/{http,crypto,provider,rate-limit}
│   ├── parsers/              # parse-garmin-sport-type, ...
│   ├── database/{repositories,mappers}
│   ├── presentation/{components,formatters,view-models}
│   ├── tests/{fixtures}
│   └── index.ts              # superfície pública do módulo
└── strava/
    ├── api/{client,dto,routes,schemas}
    ├── auth/{oauth,token-exchange,token-refresh,revoke}
    ├── webhooks/{validation,handler,processor,dto}
    ├── application/{connect,disconnect,sync,activities,cleanup}
    ├── config/               # env.ts (Strava)
    ├── domain/{entities,types,errors}
    ├── infrastructure/{http,crypto,provider,rate-limit}
    ├── parsers/              # parse-strava-activity, parse-strava-sport-type, ...
    ├── database/{repositories,mappers}
    ├── presentation/{components,formatters,view-models}
    ├── tests/{fixtures}
    └── index.ts
```

Rotas HTTP permanecem em `app/api/**` como adapters finos, importando handlers do
módulo. Exemplo alvo:

```ts
// app/api/integrations/strava/webhook/route.ts
import { handleStravaWebhookGet, handleStravaWebhookPost } from "@/modules/strava";
export const GET = handleStravaWebhookGet;
export const POST = handleStravaWebhookPost;
```

---

## Componentes e interfaces

### 1. Catálogo, ProviderId e disponibilidade (`modules/shared/integrations`)

```ts
export type ProviderId = "GARMIN" | "STRAVA" | "POLAR" | "COROS" | "SUUNTO" | "FITBIT";

export type ProviderAvailability = "AVAILABLE" | "COMING_SOON" | "PRIVATE_BETA" | "DISABLED";

export type ProviderAuthType = "OAUTH2" | "CREDENTIALS" | "API_KEY" | "OTHER";

export interface ProviderCapabilities {
  activities?: boolean;
  activityDetails?: boolean;
  dailyWellness?: boolean;
  recovery?: boolean;
  sleep?: boolean;
  hrv?: boolean;
  readiness?: boolean;
  streams?: boolean;
  laps?: boolean;
  heartRateZones?: boolean;
  powerZones?: boolean;
  webhooks?: boolean;
  oauth?: boolean;
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  description: string;
  availability: ProviderAvailability;
  authType: ProviderAuthType;
  capabilities: ProviderCapabilities;
}
```

- `PROVIDERS: ProviderDefinition[]` inicial: GARMIN e STRAVA `AVAILABLE`; POLAR/
  COROS/SUUNTO/FITBIT `COMING_SOON` com `capabilities: {}`.
- GARMIN: `authType: "CREDENTIALS"`, capabilities alinhadas ao serviço atual
  (activities, activityDetails, recovery, sleep, hrv, readiness, dailyWellness,
  heartRateZones, powerZones; `webhooks: false`).
- STRAVA: `authType: "OAUTH2"`, capabilities conforme docs oficiais (activities,
  activityDetails, streams, laps, webhooks; `sleep/hrv/readiness/recovery: false`).
  Valores exatos confirmados na documentação oficial antes de commit.
- `isProviderEnabled(id)`: combina `availability === "AVAILABLE"` com feature flag
  `INTEGRATION_<ID>_ENABLED` (default por catálogo).
- `hasCapability(providerId, capability)` e
  `getUserCapabilities(connectedProviders)` (união das capabilities dos
  conectados) para o core decidir seções.

### 2. Contratos de provider e registry (`modules/shared/integrations/contracts`)

Interfaces pequenas e opcionais, sucedendo o atual `WearableProviderContract`:

```ts
export interface BaseProvider {
  id: ProviderId;
  capabilities: ProviderCapabilities;
  authType: ProviderAuthType;
}

export interface ActivityProvider extends BaseProvider {
  listActivities(ctx: ProviderContext, input: ListActivitiesInput): Promise<NormalizedActivity[]>;
  getActivity?(ctx: ProviderContext, externalId: string): Promise<NormalizedActivity | null>;
}

export interface RecoveryProvider extends BaseProvider {
  getDailyWellness(ctx: ProviderContext, date: string): Promise<DailyWellnessSnapshot | null>;
}

export interface WebhookProvider extends BaseProvider {
  verifyChallenge(query: Record<string, string>): { ok: boolean; challenge?: string };
  handleEvent(payload: unknown): Promise<void>;
}

// Registry
export const providerRegistry: Partial<Record<ProviderId, ProviderModule>> = {
  GARMIN: garminModule,
  STRAVA: stravaModule,
};
```

`ProviderContext` carrega `userId`, `connectionId` e um acessor de secrets
(injetado), evitando que o core lide com criptografia.

O core usa `getUserActivitySources(userId)` para obter
`{ provider, connectionId }[]` e itera via registry — nunca referencia
`garminProvider`/`stravaProvider` diretamente.

### 3. Modelo de dados (Prisma)

Alterações no schema (migrações versionadas, compatíveis com dados existentes):

```prisma
// SecretType: adicionar segredos Strava (mantém os Garmin)
enum SecretType {
  GARMIN_EMAIL
  GARMIN_PASSWORD
  GARMIN_API_KEY
  STRAVA_ACCESS_TOKEN
  STRAVA_REFRESH_TOKEN
}

// WearableConnection: reforço genérico (campos abaixo já existem em parte)
// - adicionar (se ausentes): lastEventAt, lastSuccessAt, lastErrorAt
// - manter @@unique([userId, provider]); status continua ConnectionStatus.
//   (Mapeamento: REAUTH_REQUIRED == RECONNECT_REQUIRED; DEGRADED == ERROR.)

model StravaConnectionDetails {
  id                    String   @id @default(cuid())
  wearableConnectionId  String   @unique
  athleteId             String   @unique
  scopes                String[]
  accessTokenExpiresAt  DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  wearableConnection    WearableConnection @relation(fields: [wearableConnectionId], references: [id], onDelete: Cascade)
}

model StravaWebhookSubscription {
  id                     String   @id @default(cuid())
  externalSubscriptionId String   @unique
  callbackUrl            String
  status                 String
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
}

model StravaWebhookEvent {
  id               String   @id @default(cuid())
  ownerAthleteId   String?
  objectType       String
  objectId         String
  aspectType       String
  eventTime        DateTime
  payload          Json?
  processingStatus String   // PENDING | PROCESSED | FAILED
  attemptCount     Int      @default(0)
  receivedAt       DateTime @default(now())
  processedAt      DateTime?
  expiresAt        DateTime
  @@index([processingStatus, receivedAt])
  @@index([ownerAthleteId, receivedAt])
}

model StravaActivityCache {
  id                   String   @id @default(cuid())
  wearableConnectionId String
  stravaActivityId     String
  sportType            String?
  startedAt            DateTime?
  payload              Json
  fetchedAt            DateTime
  expiresAt            DateTime
  @@unique([wearableConnectionId, stravaActivityId])
  @@index([expiresAt])
}

// StravaStreamCache: criar somente se streams forem realmente necessários.
```

Decisões de dados:

- **Atividades canônicas** continuam no model `Activity` existente
  (`@@unique([provider, externalId, userId])`), agora populado por Strava também.
  `Activity.provider` passa a receber `STRAVA`.
- **Proveniência de métrica**: para a maior parte dos casos (um provider por
  atividade), `Activity.provider` + `Activity.rawPayload` já preservam a origem.
  Um contrato `ProviderMetric<T>` (`{ value, provider, providerActivityId,
  collectedAt }`) é introduzido no domínio compartilhado para quando existir
  comparação; **não** haverá merge automático entre providers.
- **Prisma multi-file**: opcional. Decisão de design: manter `schema.prisma`
  único neste ciclo (menor risco), organizando os models novos por seção
  comentada. A adoção de multi-file (`prisma/schema` folder) fica como melhoria
  futura, a validar contra a doc oficial da versão instalada. (Requisito 6.7)

### 4. Normalização de atividades e taxonomia canônica (`modules/shared/activities`)

```ts
export type ActivitySource = ProviderId;

export type RyvanoSportType =
  | "default" | "swim" | "open-water" | "bike" | "mtb" | "run" | "trail-run"
  | "triathlon" | "duathlon" | "aquathlon" | "walking" | "hiking" | "gym"
  | "crossfit" | "football" | "futsal" | "basketball" | "volleyball" | "tennis"
  | "padel" | "surf" | "rowing" | "kayak" | "stand-up-paddle";

export type NormalizedActivity = {
  source: ActivitySource;
  externalId: string;
  sportType: RyvanoSportType;
  providerSportType: string;
  startedAt: Date;
  durationSeconds?: number;
  movingSeconds?: number;
  distanceMeters?: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  elevationGain?: number;
  averageCadence?: number;
  averagePower?: number;
  maxPower?: number;
  // payload cru específico do provider (para detalhe/enriquecimento)
  raw?: Record<string, unknown>;
};
```

- `RyvanoSportType` é a **fonte única** de taxonomia. Cria-se
  `mapRyvanoSportToLegacy()` para conviver com `lib/sports.ts`,
  `lib/reports/types.ts` (`ReportThemeSport`) e resolvers existentes durante a
  transição, evitando reescrever todos os templates de uma vez.
- Persistência: `Activity.sportType` passa a guardar o `RyvanoSportType`
  canônico; `providerSportType` guardado em coluna dedicada OU dentro de
  `rawPayload`/`metrics` (decisão: adicionar coluna `providerSportType String?`
  ao `Activity` via migração para clareza e evolução futura).
- Cada módulo expõe `parse<Provider>SportType(providerValue): RyvanoSportType` e
  `normalize<Provider>Activity(raw): NormalizedActivity`. O
  `normalizeGarminActivity` atual é movido para `modules/garmin/parsers` e passa a
  produzir `NormalizedActivity` (mapeando sportType para canônico e preservando o
  original), mantendo o mesmo resultado de persistência.

### 5. Módulo Garmin (migração preservando comportamento)

Mapeamento origem → destino (comportamento idêntico, só reorganização + ajuste
de imports e de superfície):

| Origem atual | Destino |
| --- | --- |
| `server/providers/wearables/garmin.ts` | `modules/garmin/api/client/garmin-client.ts` + `infrastructure/provider` |
| `server/providers/wearables/types.ts` (parte Garmin) | `modules/garmin/domain/types.ts` + contratos em `shared` |
| `server/services/garmin-service.ts` | `modules/garmin/application/{connect,sync,disconnect,notifications}` |
| `server/services/garmin-daily-report.ts` | `modules/garmin/application/daily` |
| `server/services/garmin-activity-details.ts` | `modules/garmin/application/activities` + `presentation/view-models` |
| `server/services/garmin-connection-errors.ts` | `modules/garmin/domain/errors` |
| `server/services/garmin-notification-events.ts` | `modules/garmin/domain/events` |
| `server/garmin-reporting-settings.ts` | `modules/garmin/config` (settings) |
| `server/services/activity-normalizer.ts` (`normalizeGarminActivity`) | `modules/garmin/parsers/parse-garmin-activity.ts` |

- `modules/garmin/index.ts` reexporta a superfície pública consumida hoje
  (`connectGarminForUser`, `syncGarminForUser`, `disconnectGarminForUser`,
  `syncAllGarminUsers`, `getGarminDailySnapshotForUser`, `getLatestGarminReconnectNotification`,
  etc.), de modo que consumidores (rotas, actions, queries, admin) só troquem o
  path de import.
- **Ciclo de dependência** com `reporting.ts`: hoje `garmin-service` importa de
  `reporting` e `reporting` importa de `garmin-*`. Design: mover
  `enqueue*`/`dispatch*` genéricos para `modules/shared/reports` (ou mantê-los em
  `server/services/reporting.ts` como camada compartilhada) e deixar o módulo
  Garmin depender apenas dessa camada compartilhada; o específico de Garmin
  (daily summary, reconnect) fica no módulo e é injetado/registrado. Isso quebra o
  ciclo sem mudar comportamento.
- Migração de arquivos preferencialmente com ferramenta de move que atualiza
  imports automaticamente, seguida de `npm run build` e `npm test`.

### 6. Módulo Strava

#### 6.1 Config e ENV (`modules/strava/config/env.ts`)

Valida via Zod: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_API_BASE_URL`
(default `https://www.strava.com/api/v3`), `STRAVA_OAUTH_AUTHORIZE_URL`,
`STRAVA_OAUTH_TOKEN_URL`, `STRAVA_OAUTH_REVOKE_URL`, `STRAVA_OAUTH_CALLBACK_URL`,
`STRAVA_WEBHOOK_CALLBACK_URL`, `STRAVA_WEBHOOK_VERIFY_TOKEN`,
`STRAVA_INITIAL_BACKFILL_DAYS` (default 30),
`STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED` (default false). URLs exatas
confirmadas na doc oficial antes de uso.

#### 6.2 OAuth (`modules/strava/auth`)

- `oauth.ts`: monta URL de autorização com `client_id`, `redirect_uri`,
  `response_type=code`, `scope` (`activity:read` / `activity:read_all` conforme
  necessidade e doc oficial), e `state` assinado/persistido.
- `token-exchange.ts`: POST token URL trocando `code` por tokens; valida resposta
  com schema Zod; extrai `athlete.id`, `scope`, `expires_at`.
- `token-refresh.ts`: refresh com `grant_type=refresh_token`; persiste refresh
  token rotacionado; usa lock por conexão (ex.: coluna/registro de lock ou
  reserva otimista) para evitar refresh concorrente.
- `revoke.ts`: POST revoke URL no disconnect; limpa secrets e detalhes.
- Persistência: `WearableConnection` (genérica) + `StravaConnectionDetails`
  (athleteId, scopes, accessTokenExpiresAt) + `WearableSecret`
  (`STRAVA_ACCESS_TOKEN`, `STRAVA_REFRESH_TOKEN`).

#### 6.3 API client (`modules/strava/api/client/strava-client.ts`)

Interface (métodos implementados conforme necessidade e doc oficial):

```ts
interface StravaClient {
  getAuthenticatedAthlete(ctx): Promise<StravaAthleteDto>;
  listActivities(ctx, input: ListActivitiesInput): Promise<StravaSummaryActivityDto[]>;
  getActivity(ctx, id: string): Promise<StravaDetailedActivityDto>;
  getActivityStreams?(ctx, id: string, keys: string[]): Promise<StravaStreamSetDto>;
  getActivityLaps?(ctx, id: string): Promise<StravaLapDto[]>;
}
```

- Injeta refresh automático em 401; backoff/respeito a `X-RateLimit-*` em 429.
- DTOs em `api/dto`, schemas Zod em `api/schemas`, parsers em `parsers/`
  produzindo `NormalizedActivity`.

#### 6.4 Webhook (`modules/strava/webhooks` + rota)

- `app/api/integrations/strava/webhook/route.ts`: GET (challenge) e POST (evento),
  adapters finos.
- GET valida `hub.verify_token` contra `STRAVA_WEBHOOK_VERIFY_TOKEN` e ecoa
  `hub.challenge`.
- POST valida payload (Zod), persiste `StravaWebhookEvent` (PENDING) e responde
  rápido (2xx). O processamento pesado ocorre no `processor` (chamado pelo job/
  cron ou por dispatch assíncrono), buscando o recurso via API quando necessário e
  permitido, e fazendo upsert idempotente na `Activity` por
  `provider+externalId+userId`.
- `deauthorization` dispara cleanup do usuário Strava.
- Subscription gerenciada via `StravaWebhookSubscription` (uma por aplicação);
  script/rotina admin para criar/verificar/apagar subscription.

#### 6.5 Sync e backfill (`modules/strava/application/sync`)

- Ao conectar: backfill de `STRAVA_INITIAL_BACKFILL_DAYS` via `listActivities`.
- Contínuo: primariamente por webhook; job de reconciliação de fila
  (`processor`) processa `StravaWebhookEvent` pendentes e aplica retry/backoff.

#### 6.6 Cleanup (`modules/strava/application/cleanup`)

`purgeExpiredActivityCache()`, `purgeExpiredStreams()`,
`purgeExpiredWebhookPayloads()`, `purgeDeauthorizedUserData(userId)`,
`purgeDeletedActivityData(externalId, userId)`. Acionadas por job e por eventos
(delete/deauthorization).

### 7. Policy Gate (`modules/shared/integrations/policy`)

```ts
export type ProviderDataPolicy = {
  allowPersistentStorage: boolean;
  maxCacheAgeSeconds?: number;
  allowCrossProviderCombination: boolean;
  allowAiProcessing: boolean;
  allowThirdPartyDisclosure: boolean;
};

export const PROVIDER_POLICIES: Record<ProviderId, ProviderDataPolicy> = {
  GARMIN: { allowPersistentStorage: true, allowCrossProviderCombination: false, allowAiProcessing: false, allowThirdPartyDisclosure: false },
  STRAVA: { allowPersistentStorage: true, maxCacheAgeSeconds: /* conforme política */, allowCrossProviderCombination: false, allowAiProcessing: false, allowThirdPartyDisclosure: false },
  // futuros: definidos ao implementar
};

export function assertPolicy(providerId, action: "persist"|"combine"|"share"|"ai"): void;
```

- Chamado antes de persistir cache, combinar, compartilhar ou enviar a IA.
- `allowCrossProviderCombination` também gated por
  `STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED`.
- Para IA: qualquer caminho que enviaria dados de atividade a um LLM deve chamar
  `assertPolicy(provider, "ai")`, que lança para Strava (e Garmin) enquanto
  `allowAiProcessing === false`.

### 8. Dashboard, atividades e relatórios provider-aware (`app/` + `components/`)

- **queries.ts / dashboard**: `getDashboardData` deixa de usar
  `wearableConnection.findFirst({ provider: "GARMIN" })` e passa a carregar todas
  as conexões do usuário. O view-model expõe `connectedProviders: ProviderId[]` e
  as seções fisiológicas viram opcionais, alimentadas por
  `getAvailableDailyInsights(userId)` (que consulta capabilities + dados dos
  providers conectados via registry). Alertas deixam de citar Garmin como
  obrigatório.
- **atividades**: a lista já é quase provider-agnostic; ajustar labels/badges de
  origem e trocar resolvers duplicados por `RyvanoSportType`. O **detalhe**
  (`app/app/atividades/[id]/page.tsx`) passa a chamar uma função genérica
  `getActivityVisualData(activity)` que: (a) monta a visão base a partir dos
  campos normalizados (funciona p/ qualquer provider), e (b) enriquece via módulo
  do provider quando `activityDetails`/`streams` existirem (Garmin: dados ao vivo
  atuais; Strava: detail/streams conforme permitido). Nunca retorna `null` só por
  não ser Garmin.
- **relatórios**: introduzir `ReportSectionRequirement` (`{ capability, optional }`)
  e montar o relatório omitindo seções sem dado/capability. O daily readiness
  Garmin permanece funcionando; para Strava, gera-se relatório baseado em
  atividades/volume. Nomes de `MessageDelivery.type`: manter os prefixos atuais
  para compatibilidade e introduzir novos genéricos quando necessário (ex.:
  `DAILY_SUMMARY:` além de `DAILY_GARMIN_SUMMARY:`), com o materializer suportando
  ambos.

### 9. Tela de Integrações multi-provider (`components/integrations`)

- `IntegrationsHub` passa a iterar sobre o catálogo, gerando cards a partir de
  `IntegrationCardViewModel[]` (montados no server component a partir do catálogo
  + conexões do usuário). WhatsApp e Automações continuam como cards próprios
  (não são "providers esportivos", mas seguem no hub).
- Componentes específicos por provider ficam em
  `modules/<provider>/presentation/components` (ex.: modal de conexão Garmin;
  botão "Conectar com Strava" que redireciona para OAuth). O hub genérico não
  conhece OAuth.
- `ConnectIntegration(providerId)`: para Garmin abre modal de credenciais; para
  Strava redireciona para a URL de autorização; para `COMING_SOON` desabilita.

---

## Fluxos principais

### Conexão Strava (OAuth)

```text
Usuário clica "Conectar Strava"
  → app action/route gera state e monta authorize URL (módulo strava/auth)
  → redirect para Strava
  → Strava redireciona para /api/integrations/strava/callback?code&scope&state
  → route (adapter) → strava/auth/token-exchange
      valida state → troca code por tokens → valida resposta
      → upsert WearableConnection (STRAVA) + StravaConnectionDetails
      → grava secrets (access/refresh) criptografados
      → backfill inicial (listActivities) → normaliza → upsert Activity
  → revalidate paths (/app/integracoes, /app/dashboard, /app/atividades)
```

### Webhook Strava (evento de atividade)

```text
Strava POST /api/integrations/strava/webhook
  → valida payload → cria StravaWebhookEvent(PENDING) → responde 200 rápido
Job/processor
  → lê eventos PENDING → resolve conexão por owner_id/athleteId
  → assertPolicy(STRAVA, "persist")
  → GET /activities/{id} (se create/update e permitido) → normaliza → upsert Activity
  → delete → purgeDeletedActivityData
  → deauthorization → purgeDeauthorizedUserData
  → marca evento PROCESSED (ou FAILED + backoff)
```

### Dashboard adaptativo

```text
getDashboardData(userId)
  → carrega conexões do usuário (todas)
  → connectedProviders = [...]
  → atividades (volume/trend) — provider-agnostic
  → getAvailableDailyInsights(userId):
       para cada provider com capability recovery/sleep/hrv/readiness:
         busca snapshot (Garmin: getGarminDailySnapshotForUser)
  → view-model com seções opcionais + alerts contextuais
```

---

## Tratamento de erros

- **Por conexão**: erros de um provider marcam o estado da própria conexão
  (`ERROR`/`RECONNECT_REQUIRED`), sem afetar outras conexões.
- **Strava OAuth**: `access_denied`, state inválido, scope parcial → mensagens
  específicas; nunca logar `code`/tokens.
- **Strava API**: 401 → tentar refresh (uma vez) → repetir; 403 → marcar
  conexão/`REAUTH`; 404 → tratar como recurso ausente (delete idempotente); 429 →
  backoff respeitando limites; 5xx/timeout → retry com teto e marcação.
- **Webhook**: payload inválido → descartar com log; atleta desconhecido →
  ignorar; evento duplicado → idempotência garante no-op.
- **Policy**: `assertPolicy` lança erro tipado que impede a operação; o chamador
  registra e omite a funcionalidade.

## Estratégia de testes

- **Core (vitest)**: matriz multi-provider (Req. 21.1) — usuário sem provider, só
  Garmin, só Strava, ambos, falhas isoladas, desconexão independente, ausência de
  capability não quebra dashboard/relatório. Testar `catalog`, `capabilities`,
  `registry`, `policy` (assertPolicy bloqueia IA/combinação), taxonomia
  `RyvanoSportType` (mapeamento por provider).
- **Garmin**: reusar `tests/garmin-probe.test.ts` (ajustar imports); garantir
  paridade de comportamento pós-migração via build + testes existentes.
- **Strava**: OAuth (state, scope parcial, refresh, refresh concorrente, rotação),
  webhook (challenge, create/update/delete, deauthorization, duplicado, atleta
  desconhecido, payload inválido), API client (200/401/403/404/429/5xx/timeout/
  payload parcial), cleanup/retenção (TTL, purge). HTTP mockado; fixtures
  sanitizadas em `modules/strava/tests/fixtures`.
- **Verificação**: `npm run build` (typecheck do Next) + `npm test` após cada
  fase; `npm run lint` quando aplicável.

## Segurança e conformidade

- Secrets só no servidor, criptografados (AES-256-GCM). Nunca em logs/browser.
- Logs estruturados com `provider`, `operation`, `connection_id`, `status`; email
  Garmin logado só por domínio; tokens nunca logados.
- Webhook Strava público: challenge protegido por verify_token; POST associado a
  conexão conhecida; sem PII em logs de payload.
- Policy Gate impede arquiteturalmente IA/combinação/compartilhamento não
  permitidos. Reconciliação desabilitada por flag e por política.
- Todas as integrações de dados externos passam por validação Zod antes de virar
  contrato interno.

## Estratégia de migração e compatibilidade

1. Adições de schema são aditivas (novos models/enums), com migrações versionadas;
   `SecretType` ganha valores sem remover os existentes.
2. `Activity.sportType` migra de string crua Garmin para `RyvanoSportType`
   canônico; migração de dados converte valores existentes via mapeador Garmin, e
   adiciona `providerSportType` preenchido a partir do valor atual.
3. Módulo Garmin exposto via `index.ts` para trocar apenas paths de import nos
   consumidores; comportamento inalterado, validado por testes e build.
4. `MessageDelivery.type`: compatibilidade retroativa (materializer aceita
   prefixos antigos e novos).
5. Reconciliação e IA permanecem desligadas; nenhuma migração as ativa.

## Referências oficiais (consultar antes de implementar)

- Strava Docs: https://developers.strava.com/docs/
- Authentication: https://developers.strava.com/docs/authentication/
- API Reference: https://developers.strava.com/docs/reference/
- Webhooks: https://developers.strava.com/docs/webhooks/
- Rate Limits: https://developers.strava.com/docs/rate-limits/
- Changelog: https://developers.strava.com/docs/changelog/
- API Agreement: https://www.strava.com/legal/api
- API Policy: https://www.strava.com/legal/api_policy
- Brand Guidelines: https://developers.strava.com/guidelines/
- Prisma: https://docs.prisma.io/

> Endpoints, scopes, URLs, políticas, rate limits e contratos externos podem
> mudar. Confirmar sempre na documentação oficial vigente antes de implementar ou
> alterar.
