# Integração Garmin — Documentação Técnica End-to-End

Fluxo completo: **conexão → sync (probe/polling) → normalização → storage → relatório (WhatsApp)**.

Toda a integração fala com um **serviço Garmin intermediário HTTP próprio** (não com a Garmin diretamente). A base é `GARMIN_SERVICE_BASE_URL`; autenticação por header `X-Admin-Key` (operações administrativas: criar conta) e `X-API-Key` (operações por conta, usando a chave da conta retornada no connect). Isso isola o app do login/scraping da Garmin e entrega dados já estruturados (`activities`, `daily-report`, splits, zonas, clima etc.).

---

## Visão geral dos componentes

| Camada | Arquivo | Papel |
|--------|---------|-------|
| Provider HTTP | `server/providers/wearables/garmin.ts` | Cliente do serviço Garmin (connect, reconnect, activities, details, daily-report) |
| Contrato | `server/providers/wearables/types.ts` | Tipos `WearableProviderContract`, resultados de connect/sync/daily-report |
| Serviço central | `server/services/garmin-service.ts` | Orquestra connect, sync por usuário, batch probe/polling, revalidação, notificações de reconexão |
| Normalizador | `server/services/activity-normalizer.ts` | Converte payload cru → shape do model `Activity` |
| Detalhes de atividade | `server/services/garmin-activity-details.ts` | Monta dados visuais (splits, zonas HR/potência, clima, força) sob demanda |
| Relatório diário | `server/services/garmin-daily-report.ts` | Snapshot diário (steps, sono, HRV, readiness) com cache TTL |
| Config/settings | `server/garmin-reporting-settings.ts` | Parâmetros de job/rate-limit persistidos em `AdminAuditLog`; agenda do job |
| Crypto | `server/crypto/secret-vault.ts` | AES-256-GCM para segredos em `WearableSecret` |
| Job agendado | `app/api/integrations/garmin/jobs/route.ts` | Endpoint que roda sync batch + fila diária + dispatch WhatsApp |
| Rotas usuário | `app/api/integrations/garmin/{connect,sync,route}.ts` | Connect / sync manual / disconnect |
| Relatórios/fila | `server/services/reporting.ts` | Enfileira e despacha entregas WhatsApp (`MessageDelivery`) |
| UI conexão | `components/integrations/garmin/screenGarminConect.tsx` | Card de status + preferências + modal |
| UI login | `components/integrations/garmin/garminScreen.tsx` | Formulário estilo Garmin Connect (login/MFA/recuperar senha) |

---

## 1. Provider Garmin — `server/providers/wearables/garmin.ts`

Classe `GarminProvider implements WearableProviderContract`. Instância singleton exportada como `garminProvider`.

- `capabilities`: `["activities", "health", "sleep", "recovery", "body"]`.
- **Cliente HTTP** (`getGarminHttpClient`): `createHttpClient({ baseURL: requireEnv("GARMIN_SERVICE_BASE_URL"), timeout: 60_000 })`, memoizado. `garminRequest` loga cada request (método/path/status/duração) e converte timeout em `Error("GARMIN_REQUEST_TIMEOUT")`.
- **Padrão de erro**: helper `getGarminErrorDetail` extrai `code`/`detail`/`message`/`error`; falhas viram códigos padronizados `GARMIN_<OP>_<status>[:detail]` (ex.: `GARMIN_SYNC_401`, `GARMIN_ACTIVITY_423`). Esses códigos são consumidos depois para decidir revalidação.
- `garminAccountDataRequest(accountApiKey, path)`: request por conta com `X-API-Key`, desembrulha `response.data.data`.

### Métodos

| Método | Endpoint | Auth | Retorno |
|--------|----------|------|---------|
| `connect({email,password,label})` | `POST /accounts` | `X-Admin-Key` | `{status, externalAccountId, accountApiKey, mfaRequired?, message}` |
| `reconnect({accountApiKey})` | `POST /accounts/revalidate` | `X-API-Key` | `{ok, mfaRequired?, message}` |
| `validateConnection({accountApiKey})` | `GET /activities?start=0&limit=1` | `X-API-Key` | `{ok, message?}` |
| `syncActivities({accountApiKey,start,limit})` | `GET /activities?start&limit` | `X-API-Key` | `unknown[]` (array cru) |
| `getLatestActivity({accountApiKey,fresh})` | `GET /activities/latest?fresh` | `X-API-Key` | atividade crua ou null |
| `getActivitySummary({activityId})` | `GET /activities/:id` | `X-API-Key` | resumo |
| `getActivityDetails({activityId,maxChart,maxPoly})` | `GET /activities/:id/details` | `X-API-Key` | detalhes com séries de gráfico |
| `getActivitySplits / TypedSplits / SplitSummaries` | `.../splits`, `.../typed-splits`, `.../split-summaries` | `X-API-Key` | arrays |
| `getActivityWeather` | `.../weather` | `X-API-Key` | objeto/null |
| `getActivityHeartRateZones / PowerZones` | `.../hr-zones`, `.../power-zones` | `X-API-Key` | zonas |
| `getActivityExerciseSets` | `.../exercise-sets` | `X-API-Key` | array (musculação) |
| `getDailyReport({accountApiKey,date})` | `GET /daily-report/:date` | `X-API-Key` | `{summary, health, training, body, nutrition, warnings, cached}` |

`connect` interpreta `mfa_required === true` e extrai `accountApiKey`/`externalAccountId` de múltiplas chaves candidatas (`apiKey`, `api_key`, `accountApiKey`, ...). Quando MFA é exigido retorna `status:"error"` com `mfaRequired:true` (o app trata isso como fluxo separado).

---

## 2. Serviço central — `server/services/garmin-service.ts`

Constantes-chave:

- `GARMIN_PAGE_SIZE = 20`, `GARMIN_MAX_PAGES = 10` → sync paginado até 200 atividades por execução.
- `GARMIN_FAST_PROBE_INTERVAL_MS = 60s` vs `GARMIN_STANDARD_PROBE_INTERVAL_MS = 15min`.
- `GARMIN_RECENT_ACTIVITY_REPORT_WINDOW_MS = 36h` (janela para relatório pós-atividade "recente").
- `GARMIN_PROBE_ERROR_BACKOFF_MS = [5,15,30,60] min` (backoff exponencial por falhas consecutivas).
- `GARMIN_RECONNECT_NOTIFICATION_COOLDOWN_MS = 5min`.

### Segredos
`upsertSecret`/`getSecret` gravam/leem `WearableSecret` (`GARMIN_EMAIL`, `GARMIN_PASSWORD`, `GARMIN_API_KEY`) sempre passando por `encryptSecret`/`decryptSecret`.

### `connectGarminForUser({userId,email,password,label})`
1. Chama `garminProvider.connect`.
2. Se erro → lança (`GARMIN_MFA_REQUIRED`/`GARMIN_CONNECT_FAILED`/detalhe).
3. `upsert` de `WearableConnection` (unique `userId+provider`) com status inicial `SYNCING` (se tem apiKey) ou `ERROR`.
4. Persiste `GARMIN_EMAIL`, `GARMIN_PASSWORD` e, se presente, `GARMIN_API_KEY` (todos criptografados).
5. Sem `accountApiKey` → lança `MISSING_ACCOUNT_API_KEY`.
6. Com apiKey → marca conexão `CONNECTED`/`lastSyncStatus:"CONNECTED"`.

### `syncGarminForUser(userId, input?)`
Parâmetros: `postActivityReportMode` (`"all-new" | "latest-recent-new" | "none"`), `allowReconnectAttempt`, `recentActivityReportWindowMs`.

Fluxo:
1. Busca conexão + `GARMIN_API_KEY` (lança se ausente).
2. Marca `SYNCING`/`IN_PROGRESS`.
3. Loop de paginação (`GARMIN_MAX_PAGES` × `GARMIN_PAGE_SIZE`), chamando `syncActivities`.
4. Cada atividade → `normalizeGarminActivity` → `activity.upsert` por chave `provider_externalId_userId`. Detecta `existing` para contar `createdCount`.
5. Modo de relatório:
   - `all-new`: enfileira `enqueuePostActivityReport` para **cada** atividade nova.
   - `latest-recent-new`: guarda a atividade nova mais recente dentro da janela de 36h e enfileira **uma** ao fim.
   - `none`: não enfileira.
6. Atualiza `WearableConnection`: `CONNECTED`, `lastSyncAt`, `lastSyncStatus:"SYNCED_<n>"`, `lastProbeAt`, `nextProbeAt` (via intervalo do usuário), `lastSeenActivityExternalId` (maior `startedAt`), zera `lastProbeFailureCount`.
7. **Tratamento de erro com revalidação**: se `shouldAttemptGarminRevalidation(errorCode)` (códigos `*_401/403/423` de SYNC/VALIDATE/ACTIVITY) e `allowReconnectAttempt !== false` → tenta `revalidateGarminConnection`; se ok, re-executa o sync uma vez; senão marca `RECONNECT_REQUIRED` e notifica. Outros erros → `ERROR`/`lastSyncStatus:"FAILED"`.

### `revalidateGarminConnection(connectionId)`
Usa `garminProvider.reconnect`. Resultados: `ok` (→`SYNCING`/`REVALIDATED`), `mfaRequired` (mensagem para desativar 2FA), conta bloqueada (`isGarminAccountLockedErrorCode` → orienta recuperar senha), ou falha genérica (orienta reconectar via link do WhatsApp).

### `markGarminReconnectRequired` + `notifyGarminReconnectRequired` + `sendGarminReconnectNotification`
Marcam `RECONNECT_REQUIRED` e, se o status anterior não era esse, disparam notificação. A notificação só sai se o usuário tem WhatsApp verificado; ela é enfileirada via `enqueueGarminReconnectReport` e despachada com `dispatchPendingWhatsAppDeliveries`. Falhas registram `IntegrationEvent` `GARMIN_RECONNECT_NOTIFICATION_FAILED`. Cooldown de 5min via `getGarminReconnectNotificationCooldown`.

---

## 3. Fluxo de conexão (OAuth-like, credenciais criptografadas)

Não é OAuth padrão — é login com e-mail/senha delegado ao serviço Garmin, que devolve uma **account API key** usada dali em diante.

```
UI GarminScreen (email/senha)
  → connectGarminAction (app/actions/integrations.ts)
    → POST /api/integrations/garmin/connect
      → rate-limit (5 / 10min por usuário)
      → connectGarminForUser  → garminProvider.connect (POST /accounts, X-Admin-Key)
        → grava WearableConnection + WearableSecret (email, senha, apiKey) criptografados
      → syncGarminForUser(mode="latest-recent-new")  (sync inicial)
      → dispatchPendingWhatsAppDeliveries(maxMessages:1)
```

**Criptografia (`server/crypto/secret-vault.ts`)**: AES-256-GCM. Chave derivada de `DATA_ENCRYPTION_KEY` via SHA-256. Cada segredo guarda `ciphertext`, `nonce` (12 bytes), `authTag`, `keyVersion` (=1) em `WearableSecret`. `decryptSecret` valida o authTag (falha se adulterado).

**MFA / conta bloqueada / login requerido**: tratados como estados de erro com códigos (`GARMIN_MFA_REQUIRED`, `GARMIN_ACCOUNT_LOCKED`, `GARMIN_LOGIN_REQUIRED`) que a UI mapeia para CTAs (recuperar senha, criar conta, configurações da conta).

**Disconnect** (`disconnectGarminForUser`): apaga todos os `WearableSecret` da conexão e marca `DISCONNECTED`.

---

## 4. Sync de atividades — probes, polling, `lastSeenActivityExternalId`

Dois modos:

**(a) Sync completo** (`syncGarminForUser`): paginação profunda, upsert de todas as atividades. Usado no connect e no sync manual.

**(b) Probe/polling barato** (`syncAllGarminUsers`, batch): em vez de baixar tudo, chama `getLatestActivity({fresh:true})` e compara o external id com `lastSeenActivityExternalId` guardado na conexão:

- `getGarminActivityExternalIdForProbe` extrai o id (`activityId`/`id`/`externalId`/`uuid`).
- `shouldRunGarminSyncForProbe`: só dispara sync completo se **há** id novo, **difere** de `lastSeenActivityExternalId` **e** a atividade ainda **não está armazenada**. Isso evita ressincs desnecessários (economia de chamadas ao serviço Garmin — ver `GARMIN_API_CONSUMPTION_PLAN.md`).
- Se mudou → `syncGarminForUser` + dispatch WhatsApp; atualiza `lastProbeStatus:"NEW_ACTIVITY_SYNCED"`.
- Se não mudou → apenas atualiza probe (`UNCHANGED`/`NO_ACTIVITY`), sem baixar atividades.

**Seleção de candidatos** (`getGarminProbeCandidates`/`getGarminProbeWhere`): conexões `CONNECTED|SYNCING|ERROR` com `nextProbeAt` nulo ou vencido, ordenadas por `nextProbeAt`, `lastProbeAt`, `updatedAt`. Índice Prisma `@@index([provider, nextProbeAt])` sustenta essa query.

**Cadência adaptativa** (`getGarminProbeIntervalMs`): usuário com WhatsApp verificado **e** notificações habilitadas **e** `postActivityReport` ligado → probe rápido de **1min**; caso contrário **15min**. Assim quem quer relatório pós-treino é sondado com mais frequência.

**Backoff de erro** (`getNextGarminProbeErrorAt`): agenda `nextProbeAt` conforme `lastProbeFailureCount` (5→15→30→60 min). Erros de auth (`*_401/403/423`) tentam revalidar antes de escalar para `RECONNECT_REQUIRED`.

Campos de estado na conexão: `lastProbeAt`, `nextProbeAt`, `lastSeenActivityExternalId`, `lastProbeStatus`, `lastProbeErrorCode`, `lastProbeFailureCount`.

---

## 5. Job agendado — `app/api/integrations/garmin/jobs/route.ts`

Endpoint `GET`/`POST` `force-dynamic`, protegido por `GARMIN_ADMIN_KEY` (header `Authorization: Bearer <key>` ou `x-admin-key`).

Fluxo por execução:
1. `getGarminJobRunSchedule()` — checa se passou `jobIntervalMinutes` desde o último `IntegrationEvent` `JOB_RUN_SUCCESS`. `?force=1` ignora o gate.
2. Se não vencido → responde `skipped` com `nextAllowedAt`.
3. `syncAllGarminUsers()` — probe/polling em lote.
4. `enqueueDueDailyGarminSummaries()` — enfileira resumos diários no horário do usuário.
5. `dispatchPendingWhatsAppDeliveries()` — despacha fila WhatsApp respeitando rate-limits.
6. Grava `IntegrationEvent` `JOB_RUN_SUCCESS` com os sumários (é ele que ancora o próximo agendamento).

Este endpoint deve ser chamado por um scheduler externo (cron/worker) — não há timer interno no Next. Intervalo default `jobIntervalMinutes = 1`. UI de operação: `components/admin/garmin-jobs-panel.tsx`.

---

## 6. Detalhes de atividade — `server/services/garmin-activity-details.ts`

`getGarminActivityVisualData(activity)` monta o payload visual para a tela de atividade (só `provider === "GARMIN"`). Cache em memória TTL **5min** por `activityId:updatedAt`.

- Recupera `GARMIN_API_KEY` da conexão; sem chave → retorna null (usa `metrics` armazenado como fallback de summary).
- **Busca paralela** (`Promise.all`, cada uma tolerante a erro via `loadOptional`): summary ao vivo, splits, typed-splits, split-summaries, weather, hr-zones, power-zones, exercise-sets.
- Deriva `sportKey` (`resolveGarminSportKey`) e monta:
  - `heroStats` (duração, distância, pace/velocidade/calorias conforme esporte);
  - `overviewMetrics` (métricas específicas de corrida/natação/força/potência);
  - `barSections`: zonas de FC, zonas de potência (com fallback para `hrTimeInZone_*`/`powerTimeInZone_*` do summary) e splits;
  - `metricSections`: leituras de treino (training effect, minutos moderados/vigorosos), clima, e bloco de musculação.

Tudo com helpers de formatação de `lib/format.ts` e humanização de `lib/activity-text.ts`. Valores ausentes viram `"—"` e são filtrados.

---

## 7. Relatórios diários — `server/services/garmin-daily-report.ts`

`getGarminDailySnapshotForUser(userId, {date?})` → `GarminDailySnapshot`. Cache TTL **10min** por `userId:date` (e cache negativo de 1min em erro).

- Conexões `DISCONNECTED`/`RECONNECT_REQUIRED` → retorna null (cacheado).
- Lê `GARMIN_API_KEY`, chama `garminProvider.getDailyReport({date})`.
- `mapGarminDailySnapshot` extrai de forma defensiva:
  - **summary**: steps, distância, kcal total/ativo, FC repouso, body battery (high/low);
  - **sleep**: duração, score (`sleepScores.overall.value`), `avgSleepHRV`;
  - **hrv**: `lastNightAvg`, `weeklyAvg`, `status`;
  - **readiness**: pega o registro mais recente de `training_readiness` (`getLatestTrainingReadiness`) → score, level, `recoveryTime`, feedback.
- `hasGarminDailySnapshotData` (qualquer métrica presente) e `hasGarminDailySummaryMetrics` (readiness+FC+HRV+sleep score+body battery, todos presentes) gate se o resumo diário completo pode ser enviado; caso incompleto, o job enfileira um "sync-check" em vez do resumo (ver `enqueueDueDailyGarminSummaries`).

Consumido em `reporting.ts` para montar o relatório diário WhatsApp.

---

## 8. Normalização — `server/services/activity-normalizer.ts`

`normalizeGarminActivity(payload)` mapeia o payload cru para o shape do model `Activity`:

- `externalId` obrigatório (`getExternalId` tenta `activityId`/`id`/`externalId`/`uuid`, lança `GARMIN_ACTIVITY_ID_MISSING` se faltar).
- `startedAt`: `startTimeLocal` → `startTimeGmt` → `startTime` → agora.
- `durationSeconds`: `durationSeconds`/`duration`/`elapsedDuration`; `endedAt` = start + duração.
- `sportType`: `sportType` → `activityType.typeKey/displayName` → `eventType` → `typeKey` → `"Atividade"`.
- Métricas numéricas defensivas (`numberOrNull`): distância, calorias, FC média/máx, pace, velocidade média/máx, elevação, cadência, potência média/máx, moving time.
- `metrics` e `rawPayload` guardam o payload inteiro (`Prisma.JsonObject`) — permite reprocessar/expandir sem novo fetch. `provider = GARMIN`.

Helpers: `numberOrNull`, `stringOrNull`, `nestedStringOrNull` (lê `typeKey`/`displayName` de sub-objetos), `dateOrNull`. Coberto por `tests/garmin-normalizer.test.ts`.

---

## 9. Settings — `server/garmin-reporting-settings.ts`

Config operacional **persistida como `AdminAuditLog`** com `action = GARMIN_REPORTING_SETTINGS_UPDATE` (lê o registro mais recente). `getStoredGarminReportingSettings()` retorna, com defaults e clamps:

| Campo | Default | Faixa |
|-------|---------|-------|
| `jobIntervalMinutes` | 1 | 1–1440 |
| `maxUsersPerRun` | 5 | 1–500 |
| `maxProbesPerRun` | 20 (ou `env.GARMIN_MAX_PROBES_PER_RUN`) | 1–5000 |
| `delayBetweenUserSyncSeconds` | 10 | 0–300 |
| `maxMessagesPerRun` | 3 | 1–500 |
| `delayBetweenMessagesSeconds` | 20 | 0–300 |
| `maxMessagesPerHour` | 24 | 1–5000 |
| `maxMessagesPerDay` | 150 | 1–50000 |
| `whatsappDispatchPaused` | false | bool |

`getGarminJobRunSchedule({now?})` combina settings + último `IntegrationEvent` `JOB_RUN_SUCCESS` para calcular `lastRunAt`, `nextAllowedAt` e `due`. `normalizeGarminReportingSettings` faz clamp/parse robusto (`clampInteger`, `booleanFrom`).

---

## 10. Componentes UI — `components/integrations/garmin/`

**`screenGarminConect.tsx`** — card na página de integrações:
- Status via `StatusBadge` (`CONNECTED` / `RECONNECT_REQUIRED` / não conectado).
- Se não conectado/revalidação: botão abre modal (portal) com `GarminScreen`.
- Se conectado: métricas (status, última sync, `lastSyncStatus`), botões "Sincronizar agora" (`syncGarminAction`) e "Desconectar" (`disconnectGarminAction`), e `GarminReportPreferencesForm`.
- `GarminReportPreferencesForm`: checkboxes `enabled`/`postActivityReport`/`dailySummary` + horário do resumo diário (interpretado em **UTC**) → `saveGarminReportPreferencesAction`. Avisa se WhatsApp não verificado.
- Mostra última notificação de reconexão e mensagens de conta bloqueada/MFA (`getReconnectRequiredMessage`, `isGarminAccountLockedErrorCode` — duplicado no client para renderização).

**`garminScreen.tsx`** — formulário de login réplica do Garmin Connect (header/footer "connect", imagem de fundo):
- e-mail + senha (toggle mostrar), submit → `connectGarminAction`.
- Em sucesso: `router.refresh()` + `onSuccess()` (fecha modal).
- Trata códigos de erro com CTAs: `GARMIN_ACCOUNT_LOCKED` (recuperar senha), `GARMIN_LOGIN_REQUIRED` (recuperar/criar conta), `GARMIN_MFA_REQUIRED` (configurações da conta). URLs via `NEXT_PUBLIC_GARMIN_*` com fallback para o SSO oficial da Garmin.

---

## Fluxo end-to-end consolidado

```
CONEXÃO
  UI garminScreen → connect action → POST /connect
    → connectGarminForUser → provider.connect (POST /accounts)
    → WearableSecret (email/senha/apiKey) cifrados (AES-256-GCM)
    → sync inicial (latest-recent-new)

SYNC (polling)
  scheduler externo → GET/POST /jobs (X-Admin-Key)
    → getGarminJobRunSchedule (gate por jobIntervalMinutes)
    → syncAllGarminUsers:
        candidatos (nextProbeAt vencido) → getLatestActivity(fresh)
        compara latest id vs lastSeenActivityExternalId
        mudou? → syncGarminForUser (paginação → normalize → upsert)
        cadência 1min (fast) / 15min (standard); backoff 5/15/30/60min
        auth error → revalidate → senão RECONNECT_REQUIRED + notifica

NORMALIZAÇÃO
  normalizeGarminActivity: payload cru → campos tipados + metrics/rawPayload (JSON)

STORAGE (Postgres via Prisma)
  Activity (unique provider+externalId+userId)
  WearableConnection (estado de probe/sync)
  WearableSecret (segredos cifrados)
  IntegrationEvent (JOB_RUN_SUCCESS, notificações de reconexão)
  MessageDelivery (fila WhatsApp, unique userId+type)

RELATÓRIO
  atividade nova → enqueuePostActivityReport (se elegível)
  horário diário → enqueueDueDailyGarminSummaries (usa daily snapshot)
  dispatchPendingWhatsAppDeliveries → Evolution (rate-limit hora/dia, pausa global)
  detalhes sob demanda → getGarminActivityVisualData (splits, zonas, clima, força)
```

### Modelos Prisma envolvidos
`WearableConnection` (1:1 por usuário+provider, estado de probe), `WearableSecret` (segredos cifrados, unique conexão+tipo), `Activity` (unique `provider+externalId+userId`, guarda `metrics`+`rawPayload`), `NotificationPreference` (liga fast-probe e relatórios), `WhatsAppIdentity` (gate de envio), `MessageDelivery` (fila, unique `userId+type`), `IntegrationEvent` (agenda de jobs + auditoria de notificações), `AdminAuditLog` (persistência das settings).

### Variáveis de ambiente
`GARMIN_SERVICE_BASE_URL`, `GARMIN_ADMIN_KEY`, `GARMIN_MAX_PROBES_PER_RUN`, `DATA_ENCRYPTION_KEY`, `NEXT_PUBLIC_GARMIN_RECOVER_PASSWORD_URL`, `NEXT_PUBLIC_GARMIN_CREATE_USER_URL`, `NEXT_PUBLIC_GARMIN_ACCOUNT_SETTINGS_URL`.

### Testes relacionados
`tests/garmin-normalizer.test.ts`, `tests/garmin-probe.test.ts`, `tests/secret-vault.test.ts`, `tests/post-activity-report-template.test.ts`.

### Specs de referência
`ryvano_specs/03_INTEGRATIONS_GARMIN_WHATSAPP.md`, `ryvano_specs/GARMIN_API_CONSUMPTION_PLAN.md` (racional do polling barato via `getLatestActivity`), `ryvano_specs/04_DATA_SECURITY_AUTH.md`.
