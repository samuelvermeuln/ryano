# Integração WhatsApp via Evolution API — ryvano

Documentação técnica do fluxo completo: **ativação → verificação → envio de relatórios → tracking de entrega**.

A ryvano usa a [Evolution API](https://doc.evolution-api.com/) (integração `WHATSAPP-BAILEYS`) como gateway de WhatsApp. Uma única instância (`ryvano`, o número da plataforma) atende todos os usuários. Cada usuário vincula seu próprio número via um fluxo OTP inverso: em vez de a ryvano enviar um código, é o **usuário quem envia o código** para o número da ryvano, provando posse do número sem custo de mensagem de saída.

---

## 1. Componentes e responsabilidades

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Provider | `server/providers/messaging/evolution.ts` | Cliente HTTP da Evolution API; ensure/status/QR/webhook/sendText/sendImage/findMessages/disconnect |
| Contrato | `server/providers/messaging/types.ts` | Tipos e interface `MessagingProviderContract` |
| Config/env | `server/env.ts` | Vars `EVOLUTION_*`, nome da instância, eventos de webhook, URL de webhook |
| Settings | `server/evolution-settings.ts` | Lê `allowHttpFallback` persistido no `AdminAuditLog` |
| Ativação (service) | `server/services/whatsapp-activation.ts` | Gera/cancela/verifica token de ativação; upsert de `WhatsAppIdentity` |
| API ativação | `app/api/whatsapp/activation/route.ts` | `POST` gera link `wa.me` |
| API status | `app/api/whatsapp/activation/status/route.ts` | `GET` status + fallback de verificação; `DELETE` cancela |
| Webhook | `app/api/webhooks/evolution/route.ts` | Recebe eventos da Evolution; confirma ativação em tempo real |
| Report builder | `server/services/report-builder.ts` | Monta caption + `ReportRequest` (post-activity, daily-garmin, sync-check, reconnect) |
| Reporting | `server/services/reporting.ts` | Fila de `MessageDelivery`, throttling, dispatch, retries, materialização |
| Gerador de imagem | `lib/reports/generate-report.ts` | Renderiza o `ReportRequest` em PNG 1080×1620 (`ImageResponse`) |
| UI ativação | `components/integrations/whatsapp-activation-card.tsx` | Card do usuário: gera link + polling de status |
| UI admin | `components/admin/evolution-tools.tsx` | QR, status, desconectar, config de webhook, mensagem de teste |
| UI admin (entrega) | `components/admin/message-delivery-panel.tsx` | Painel de tracking de entregas |
| Server actions | `app/actions/integrations.ts` | Wire da UI: gera ativação, teste, dispatch pós-sync |
| Utils | `server/utils/phone.ts` | `normalizePhoneToE164`, `toWhatsappJid` |

---

## 2. Modelo de dados (Prisma)

### `WhatsAppIdentity` — número verificado do usuário
```prisma
model WhatsAppIdentity {
  id          String    @id @default(cuid())
  userId      String    @unique          // 1:1 com User
  phoneE164   String                      // número confirmado, formato +55...
  externalJid String?                     // JID do WhatsApp (ex: 5511...@s.whatsapp.net)
  verifiedAt  DateTime?                    // null = não verificado; datado = ativo
  status      String                       // "VERIFIED" após confirmação
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```
- Fonte de verdade de "o usuário confirmou o WhatsApp". `verifiedAt != null` é o gate para qualquer envio de relatório.
- `externalJid` deriva do sender real que enviou o código (fallback `toWhatsappJid(phoneE164)`).

### `WhatsAppActivationToken` — fluxo OTP-like
```prisma
model WhatsAppActivationToken {
  id           String    @id @default(cuid())
  userId       String
  tokenHash    String    @unique          // hash do código; o raw nunca é persistido
  phoneE164    String                      // número esperado do remetente
  expiresAt    DateTime                     // TTL 15 min
  consumedAt   DateTime?                    // null = ativo; datado = usado/cancelado
  attemptCount Int       @default(0)
  createdAt    DateTime  @default(now())
  @@index([userId, createdAt])
}
```
- TTL: **15 minutos** (`ACTIVATION_TTL_MS`).
- Ao gerar um novo token, todos os anteriores ativos do usuário são marcados como `consumedAt = now()` (invalidação implícita — só um token vivo por vez).
- Armazena apenas o **hash** (`hashToken`); o código bruto (`generateRawToken(12)`, hex de 24+ chars) só existe no link `wa.me`.

### `MessageDelivery` — unidade de entrega/tracking
```prisma
enum Channel { WHATSAPP }
enum DeliveryStatus { PENDING SENT DELIVERED FAILED }

model MessageDelivery {
  id                String         @id @default(cuid())
  userId            String
  channel           Channel                       // WHATSAPP
  type              String                         // chave lógica (ver abaixo)
  provider          String                         // "EVOLUTION"
  externalMessageId String?                        // id da mensagem OU lock "LOCK:<uuid>"
  status            DeliveryStatus @default(PENDING)
  sentAt            DateTime?
  deliveredAt       DateTime?
  failedAt          DateTime?
  errorCode         String?                        // detalhe de falha (≤280 chars)
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
  @@unique([userId, type])                         // idempotência por (usuário, tipo)
}
```
- **`@@unique([userId, type])`** é o mecanismo central de idempotência: uma dada notificação lógica existe no máximo uma vez por usuário.
- `type` codifica o conteúdo a materializar:
  - `POST_ACTIVITY_REPORT:<activityId>`
  - `DAILY_GARMIN_SUMMARY:<YYYY-MM-DD>`
  - `GARMIN_DAILY_SYNC_CHECK:<YYYY-MM-DD>`
  - `GARMIN_RECONNECT_ALERT:<connectionId>:<automatic|admin>:<cooldownWindow>`
  - reenvios: `<canonicalType>::RESENT:<iso>:<deliveryId>` (o "canonical type" é extraído removendo o sufixo `::RESENT:`).

### Modelos de apoio
- **`NotificationPreference`** (1:1): `enabled`, `postActivityReport`, `dailySummary`, `weeklySummary`, `reportTime`, `timezone`. Gate de elegibilidade por tipo de relatório.
- **`IntegrationEvent`** (`@@unique([provider, eventType, externalId])`): log idempotente de eventos. Recebe o payload cru dos webhooks Evolution e eventos internos `WHATSAPP_DELIVERY_SENT` / `WHATSAPP_DELIVERY_FAILED`.
- **`AdminAuditLog`**: guarda a última config de webhook (`EVOLUTION_WEBHOOK_CONFIG_UPDATE` / `EVOLUTION_INSTANCE`), de onde `evolution-settings.ts` lê `allowHttpFallback`.

---

## 3. Configuração (env + settings)

`server/env.ts` valida via Zod:

| Var | Uso |
|---|---|
| `EVOLUTION_API_BASE_URL` | base do cliente axios (obrigatória em runtime via `requireEnv`) |
| `EVOLUTION_API_KEY` | header `apikey` (e `token` numa das tentativas de create) |
| `EVOLUTION_INSTANCE_NAME` | default `ryvano` (`DEFAULT_EVOLUTION_INSTANCE_NAME`) |
| `EVOLUTION_WEBHOOK_SECRET` | se setado, exigido no header `x-webhook-secret`/`authorization` e enviado nos headers do webhook |
| `EVOLUTION_WEBHOOK_EVENTS` | CSV; default: `QRCODE_UPDATED, CONNECTION_UPDATE, GROUPS_UPSERT, GROUP_UPDATE, GROUP_PARTICIPANTS_UPDATE, MESSAGES_UPSERT` |
| `EVOLUTION_ALLOW_HTTP_FALLBACK` | `"false"` bloqueia webhook em HTTP não-TLS |
| `APP_URL` | base da URL de webhook (`/api/webhooks/evolution`) |

- `getEvolutionWebhookUrl()` monta `<APP_URL>/api/webhooks/evolution` e lança `EVOLUTION_HTTP_FALLBACK_DISABLED` se protocolo ≠ HTTPS e fallback desligado. O toggle é lido em runtime por `getStoredEvolutionHttpFallbackAllowed()` (último `AdminAuditLog`), com fallback para a env.
- Erro amigável para certificado autoassinado (`DEPTH_ZERO_SELF_SIGNED_CERT`) → instrui usar `http://` local.

---

## 4. Fluxo de ATIVAÇÃO → VERIFICAÇÃO

### 4.1 Geração do link (usuário clica "Confirmar pelo WhatsApp")

`components/integrations/whatsapp-activation-card.tsx` → `generateWhatsAppActivationAction` (`app/actions/integrations.ts`) → `generateWhatsAppActivation()` (`server/services/whatsapp-activation.ts`).

Também exposto em `POST /api/whatsapp/activation` (rate limit 5 / 15 min por usuário).

Passos de `generateWhatsAppActivation(userId, name, phone)`:
1. `normalizePhoneToE164(phone)` → falha `INVALID_PHONE`.
2. Invalida tokens ativos anteriores (`updateMany … consumedAt = now`).
3. `rawToken = generateRawToken(12)`; persiste `tokenHash = hashToken(rawToken)`, `phoneE164`, `expiresAt = now + 15 min`.
4. `evolutionProvider.getStatus()` para obter o número conectado da ryvano. Se a instância **não estiver conectada** ou sem número → `EVOLUTION_INSTANCE_PHONE_UNAVAILABLE`.
5. Monta a mensagem: `Olá, sou <nome>. Código de ativação ryvano: <rawToken>`.
6. Retorna `activationUrl = https://wa.me/<numeroRyvano>?text=<mensagem>`, `expiresAt`, `rawToken`.

> Nota de segurança: o código bruto só transita pelo link `wa.me`; no banco fica apenas o hash.

### 4.2 Usuário envia a mensagem no WhatsApp

O usuário abre o link, o WhatsApp pré-preenche a mensagem com o código, e ele envia para o número da ryvano. A Evolution recebe essa mensagem inbound.

### 4.3 Verificação — dois caminhos

**Caminho A — Webhook (tempo real)** — `app/api/webhooks/evolution/route.ts` (`POST`):
1. Valida `x-webhook-secret` (se `EVOLUTION_WEBHOOK_SECRET` estiver setado) → `401 UNAUTHORIZED_WEBHOOK`.
2. Limite de tamanho: `content-length`/body > 64 KB → `413 PAYLOAD_TOO_LARGE`; JSON inválido → `400`.
3. **Registra o evento cru** em `IntegrationEvent` (upsert idempotente por `provider=EVOLUTION`, `eventType`, `externalId`).
4. Extrai `sender` (`data.key.participant/remoteJid`, `data.from/sender`, `payload.sender`) e `text` (`conversation`, `extendedTextMessage.text`, captions, `body`).
5. `extractWhatsAppActivationToken(text)` → regex `/[A-Fa-f0-9]{24,}/`. Sem código → `200 { ok: true }` (loga candidato se o texto mencionar "ativação ryvano").
6. Com código → `verifyWhatsAppActivation({ token, senderPhone: senderJid, externalJid: senderJid })`.
7. Sempre responde `200 { ok: true }` (falha de verificação é logada como `warn`, não propaga erro ao provedor).

**Caminho B — Polling / fallback (pull)** — `GET /api/whatsapp/activation/status`:
- A UI faz polling a cada **20 s**, janela máxima de **60 s** (`ACTIVATION_MAX_CHECKS = 3`).
- Se ainda não verificado e existe ativação pendente, chama `verifyPendingWhatsAppActivationFromEvolution(userId)`:
  1. Busca o token ativo mais recente.
  2. `evolutionProvider.findIncomingMessages({ phoneE164, since: createdAt, until: expiresAt })` — usa `POST /chat/findMessages/<instance>`, filtra por `remoteJid`, remetente esperado e janela temporal (±5 min de folga).
  3. Para cada mensagem, extrai o código e tenta `verifyWhatsAppActivation`.
- Retorna `{ verified, phoneE164, status, activationPending, activationExpiresAt }`.
- `DELETE` cancela ativações pendentes (`cancelActiveWhatsAppActivation`).

### 4.4 `verifyWhatsAppActivation` — a validação canônica

```
token → hashToken → busca WhatsAppActivationToken por tokenHash
```
Rejeições (todas logadas com telefone mascarado):
- `INVALID_SENDER` — remetente não normaliza para E.164.
- `INVALID_OR_EXPIRED_TOKEN` — token inexistente, já consumido ou expirado.
- `PHONE_MISMATCH` — `activation.phoneE164 != senderPhone` (incrementa `attemptCount`).
- `TOKEN_ALREADY_CONSUMED` — consumo condicional (`updateMany` com guard `consumedAt: null, expiresAt > now, phoneE164 = sender`) retornou ≠ 1 (proteção contra corrida).

Sucesso:
- Consome o token (`consumedAt = now`, `attemptCount++`).
- **`prisma.whatsAppIdentity.upsert`** por `userId`: grava `phoneE164`, `externalJid` (ou `toWhatsappJid`), `verifiedAt = now`, `status = "VERIFIED"`.
- Retorna o `user`.

A UI, ao detectar `verified: true` no polling, marca `confirmed`, faz `router.refresh()` e recarrega a tela.

### Diagrama — ativação/verificação
```
Usuário (UI)                 ryvano (server)                Evolution API           WhatsApp
   │  clicar "Confirmar"          │                              │                     │
   ├─────────────────────────────>│ generateWhatsAppActivation   │                     │
   │                              ├─ cria token (hash, TTL 15m)  │                     │
   │                              ├─ getStatus() ────────────────>│                     │
   │  <── activationUrl (wa.me) ──┤                              │                     │
   │  abre link, envia código ───────────────────────────────────────────────────────>│
   │                              │                  MESSAGES_UPSERT (inbound)          │
   │                              │  <── POST /api/webhooks/evolution ──────────────────┤
   │                              ├─ IntegrationEvent (log cru)  │                     │
   │                              ├─ extrai código + verify      │                     │
   │                              ├─ upsert WhatsAppIdentity (VERIFIED)                 │
   │  polling GET /status (20s) ─>│  (fallback: findMessages) ───>│                     │
   │  <── { verified: true } ─────┤                              │                     │
```

---

## 5. Fluxo de ENVIO DE RELATÓRIOS

Todo envio passa por **fila** (`MessageDelivery`) + **materialização tardia** + **throttling**. Nada é enviado direto no fluxo do usuário (exceto a mensagem de teste do admin/integrações).

### 5.1 Enfileiramento (enqueue)

`server/services/reporting.ts`:
- `enqueuePostActivityReport(activityId)` — gate: `whatsappIdentity.verifiedAt` + `notificationPreference.postActivityReport` + `enabled`. Tipo `POST_ACTIVITY_REPORT:<id>`.
- `enqueueDueDailyGarminSummaries({ userId?, now? })` — varre usuários com WhatsApp verificado, `dailySummary` ligado e conexão Garmin ativa; compara `reportTime`/`timezone` (default `18:00 UTC`); só enfileira `DAILY_GARMIN_SUMMARY:<data>` quando as métricas completas estiverem disponíveis. Caso contrário, aguarda o próximo job sem enviar aviso ao usuário.
- `enqueueGarminReconnectReport(...)` — alerta de reconexão com janela de cooldown de 5 min no tipo.

Todos convergem para `ensurePendingDelivery(userId, type)`:
- `SENT`/`DELIVERED` → não reenfileira (`ALREADY_SENT`).
- `PENDING` → `ALREADY_PENDING`.
- `FAILED` (ou outro) existente → re-`PENDING` (limpa `failedAt`/`errorCode`/`externalMessageId`) = `REQUEUED`.
- Inexistente → cria `PENDING`. Corrida em `@@unique` (`P2002`) → `ALREADY_QUEUED`.

### 5.2 Dispatch — `dispatchPendingWhatsAppDeliveries(...)`

Chamado pós-sync (`syncGarminAction`/`connectGarminAction` em `app/actions/integrations.ts`, `maxMessages: 1`) e por jobs de reporting.

Ordem:
1. **Pausa global**: `settings.whatsappDispatchPaused` (a menos que `ignorePause`) → retorna tudo como `throttled`, `paused: true`.
2. **Orçamento (throttling)**: conta `SENT+DELIVERED` na última hora e no último dia; `allowedByBudget = min(maxMessages, maxPerHour − sentHour, maxPerDay − sentDay)`. Defaults em `garmin-reporting-settings.ts`.
3. Seleciona `PENDING` **não travados** (`externalMessageId = null` OU lock `LOCK:` expirado por `DELIVERY_LOCK_TTL_MS = 10 min`), ordem FIFO (`createdAt asc`), `take = allowedByBudget`.
4. Para cada entrega → `dispatchSpecificWhatsAppDelivery`, com `delayBetweenMessagesSeconds` entre envios.
5. Retorna resumo (`pending, scanned, sent, failed, throttled, budgets, sentLastHour/Day, paused`).

### 5.3 `dispatchSpecificWhatsAppDelivery`

1. **Reserva/lock** (`reservePendingDelivery`): `updateMany` condicional grava `externalMessageId = LOCK:<uuid>`. Se count ≠ 1 → outra execução pegou; `skipped`. Isso torna o dispatch concorrência-safe.
2. **Materializa** (`materializeDelivery`) — resolve o `type` canônico no conteúdo real:
   - `POST_ACTIVITY_REPORT:` → re-checa elegibilidade → `buildPostActivityWhatsAppReport` → **imagem** PNG + caption + fileName.
   - `DAILY_GARMIN_SUMMARY:` → snapshot Garmin do dia → `buildDailyGarminSummaryWhatsAppReport` (imagem).
   - `GARMIN_DAILY_SYNC_CHECK:` → tipo legado bloqueado; não envia aviso de leituras ausentes. Quando a snapshot estiver completa, a próxima rodada a promove para `DAILY_GARMIN_SUMMARY:`.
   - `GARMIN_RECONNECT_ALERT:` → resolve URL de revalidação/recuperação → `buildGarminReconnectWhatsAppReport` (imagem).
   - Elegibilidade perdida → `{ ok: false, errorCode }` → entrega marcada `FAILED`.
3. **Envia** via provider:
   - imagem → `evolutionProvider.sendImage` (`POST /message/sendMedia/<instance>`).
   - texto → `evolutionProvider.sendText` (`POST /message/sendText/<instance>`).
4. **Persiste resultado**: `SENT` (grava `externalMessageId`, `sentAt`) ou `FAILED` (grava `failedAt`, `errorCode`).
5. **Registra eventos**: `recordWhatsAppDeliveryEvent` (`IntegrationEvent` `WHATSAPP_DELIVERY_SENT`/`_FAILED`, com `debug`: mode/endpoint/variant/attempts) e, para reconnect, `recordGarminReconnectDeliveryEvent`.

### 5.4 Geração da imagem — `lib/reports/generate-report.ts`

O `report-builder` produz um `ReportRequest` (template + data). `generateReport(request)`:
- Hidrata avatar (`resolveAvatarImageForReport`) quando aplicável.
- Renderiza templates gerais com `next/og` `ImageResponse` em **1080×1620**, fonte Geist e logos embutidos.
- Para `athlete-daily-readiness` (`DAILY_GARMIN_SUMMARY`), rasteriza o SVG com Resvg em **800×1124** usando `public/fonts/Geist-Regular.ttf`, `loadSystemFonts: false` e `defaultFontFamily: "Geist"`.
- Retorna sempre `Buffer` PNG, consumido por `sendImage` como base64.

`DAILY_GARMIN_SUMMARY` não pode ser convertido diretamente por Sharp/libvips com fallback de fonte do sistema e não pode ser pré-visualizado como SVG: produção e preview devem chamar o mesmo `generateReport(request)`. Consulte `docs/athlete-daily-readiness-fix.md` para as invariantes de fonte, ícones vetoriais e validação.

### 5.5 Provider `sendImage` — robustez de payload

`evolutionProvider.sendImage` tenta **7 variantes** de payload em sequência (flat/nested, `media`/`base64`, data-URI/raw-base64) até obter `status: "sent"`, acumulando `attempts` no `debug`. Isso absorve diferenças de versão/config da Evolution para envio de mídia. `sendText` é uma única chamada direta.

`getMessageResultFromResponse` interpreta o payload: extrai `key.id`/`id` como `externalMessageId`; detecta falhas por `status/error/detail/message` (`getEvolutionMessageFailureDetail`).

---

## 6. TRACKING DE ENTREGA

### Máquina de estados (`DeliveryStatus`)
```
              enqueue                dispatch (lock + send)
   (novo) ─────────────> PENDING ───────────────────────────> SENT
      ▲                    │  ▲                                  │
      │ requeue/redeliver  │  │ lock LOCK:<uuid> (TTL 10m)       │ (webhook de status
      │                    │  │  reservado durante o envio       │  poderia promover
      └──── FAILED <───────┘  └──────────────────────────────── DELIVERED)
             (errorCode, failedAt)
```
- **PENDING**: na fila. Pode estar temporariamente "reservado" com `externalMessageId = LOCK:<uuid>` durante um dispatch (auto-liberado após 10 min se o processo morrer).
- **SENT**: aceito pela Evolution; `externalMessageId` = id da mensagem, `sentAt` datado.
- **FAILED**: falha na materialização ou no envio; `errorCode` (≤280 chars, normalizado) + `failedAt`.
- **DELIVERED**: estado previsto no enum e nos filtros de orçamento, para confirmação de entrega. O código atual promove até `SENT`; a confirmação `DELIVERED` depende de evento de status da Evolution (os eventos de webhook padrão incluem `MESSAGES_UPSERT`; a promoção a `DELIVERED` é o ponto de extensão natural). Contagens de orçamento já tratam `SENT` e `DELIVERED` equivalentes.

### Idempotência e concorrência
- `@@unique([userId, type])`: uma notificação lógica por usuário.
- `ensurePendingDelivery` nunca reenvia algo `SENT`/`DELIVERED`.
- Lock ótimista (`reservePendingDelivery` + TTL) evita envio duplicado sob concorrência.

### Reprocessamento (retries)
| Função | Efeito |
|---|---|
| `dispatchWhatsAppDeliveryById(id)` | Re-`PENDING` e dispara imediatamente (recusa se já `SENT`/`DELIVERED`) |
| `redeliverWhatsAppDeliveryById(id, {dispatchNow?})` | **Reenvio de algo já enviado**: arquiva o registro canônico ativo como `::RESENT:<iso>:<id>` e cria um novo `PENDING` do tipo canônico (opcionalmente dispara na hora) |
| `requeueMessageDeliveryById(id)` | Volta um `FAILED` para `PENDING` (não dispara) |
| `requeueFailedWhatsAppDeliveries({limit?})` | Requeue em lote de `FAILED` (default 50) |

### Auditoria
Cada tentativa gera um `IntegrationEvent` (`WHATSAPP_DELIVERY_SENT`/`_FAILED`) com payload de debug: `deliveryId`, `deliveryType`, `phoneE164`, `detail`, `externalMessageId`, `transportMode` (text/image), `endpoint`, `variant`, `attempts[]`. O painel admin `components/admin/message-delivery-panel.tsx` consome esses dados para inspeção/reenvio.

---

## 7. Superfícies de UI

### Usuário — `whatsapp-activation-card.tsx`
- Mostra número confirmado e status ("WhatsApp conectado" / "Aguardando confirmação").
- Botão gera o link `wa.me`; abre passos 1–4.
- Inicia polling automático (20 s × 3, teto 1 min): estados `idle → checking → confirmed | timed_out`.
- Ao confirmar: refresh + reload; ao esgotar: instrui gerar novo link.

### Admin — `evolution-tools.tsx`
- **Status/identidade**: `StatusBadge` conectado/desconectado, `identity` (ownerJid), número, e status do ensure ("criada automaticamente" / "já estava pronta").
- **QR Code**: exibe QR (`data:image/png;base64,...`) só quando precisa reconectar; botões *Atualizar QR*, *Desconectar*, *Atualizar dados* (server actions `refreshEvolutionQrAction`, `disconnectEvolutionInstanceAction`, `refreshEvolutionStateAction`).
- **Config de webhook**: textarea de eventos monitorados (CSV) + checkbox "Permitir conexão local temporária" (`allowHttpFallback`) → `updateEvolutionWebhookConfigAction` (persiste no `AdminAuditLog`).
- **Mensagem de teste**: telefone + texto → `sendEvolutionTestMessageAction`.
- Painéis complementares: `message-delivery-panel.tsx` (tracking), `evolution-media-test-panel.tsx`, `whatsapp-report-preview-panel.tsx`, `message-throughput-chart.tsx`.

---

## 8. Ciclo de vida da instância Evolution

`EvolutionProvider` gerencia a instância única (`ryvano`), com de-dup de chamada concorrente (`ensureInstancePromise`):
- `ensureInstanceExists` → checa `connectionState`; se ausente (`404/400`), tenta criar em 3 variantes de body (`instanceName`/`name`/`+token`), integração `WHATSAPP-BAILEYS`, com webhook já embutido; `409` = já existe.
- `getStatus` → `connectionState` + `fetchInstances` para extrair `ownerJid`/número; normaliza estado (`open|connected` = conectado).
- `getConnectQrCode` → `instance/connect`; retorna QR (base64/code) se desconectado.
- `getWebhookConfig` / `configureWebhook` → `webhook/find|set`.
- `disconnect` → `instance/logout` + `waitForDisconnected` (poll até 12×500 ms).

---

## 9. Resumo do fluxo ponta a ponta

```
[ATIVAÇÃO]     usuário clica → token (hash, TTL 15m) → link wa.me com código
                    │
[VERIFICAÇÃO]  usuário envia código no WhatsApp
                    ├─ webhook Evolution (tempo real) ──┐
                    └─ polling /status (fallback 20s) ──┤→ verifyWhatsAppActivation
                                                        └→ WhatsAppIdentity: verifiedAt + VERIFIED
                    │
[ENVIO]        evento (nova atividade / resumo diário / reconnect)
                    → enqueue MessageDelivery (PENDING, @@unique userId+type)
                    → dispatch: pausa? orçamento? lock → materializa (imagem PNG) → sendText/sendMedia
                    │
[TRACKING]     SENT (externalMessageId, sentAt) | FAILED (errorCode, failedAt)
                    → IntegrationEvent WHATSAPP_DELIVERY_SENT/_FAILED (debug)
                    → retries: requeue / redeliver / dispatchById
                    → (DELIVERED reservado p/ confirmação via evento de status)
```
