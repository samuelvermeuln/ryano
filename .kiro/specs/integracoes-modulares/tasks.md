# Plano de Implementação — Arquitetura Modular de Integrações Esportivas

> Execução incremental. Cada tarefa é uma etapa de código isolada e testável,
> construída sobre as anteriores. Ao final de cada fase, rodar `npm run build`
> (typecheck) e `npm test`. Antes de implementar qualquer endpoint/DTO/scope/
> webhook externo do Strava, consultar a documentação oficial vigente (ver
> checklist na Fase 5+). Referências entre parênteses apontam para os requisitos
> em `requirements.md`.

---

## Fase 1 — Preparar o core multi-provider

- [x] 1. Criar a base do módulo compartilhado de integrações
  - Criar `modules/shared/integrations/types/` com `ProviderId`,
    `ProviderAvailability`, `ProviderAuthType`.
  - Ajustar `tsconfig.json` (paths) se necessário para resolver `@/modules/*`.
  - _Requisitos: 1.2, 1.3, 4.5_

- [x] 1.1 Definir o contrato de capabilities
  - Criar `modules/shared/integrations/capabilities/` com `ProviderCapabilities`
    e helpers `hasCapability(providerId, cap)` e
    `getUserCapabilities(connectedProviders)`.
  - _Requisitos: 2.1, 2.2, 2.4_

- [x] 1.2 Criar o catálogo central de providers
  - Criar `modules/shared/integrations/catalog/` com `ProviderDefinition` e
    `PROVIDERS[]` (GARMIN/STRAVA `AVAILABLE`; POLAR/COROS/SUUNTO/FITBIT
    `COMING_SOON`).
  - Definir capabilities de GARMIN conforme comportamento atual; deixar STRAVA
    com placeholder a confirmar na Fase 5.
  - Adicionar `isProviderEnabled(id)` combinando disponibilidade + feature flag.
  - _Requisitos: 1.1, 1.4, 1.5, 1.6, 1.7, 2.5_

- [x] 1.3 Definir contratos de provider e registry
  - Criar `modules/shared/integrations/contracts/` com interfaces pequenas
    (`BaseProvider`, `ActivityProvider`, `RecoveryProvider`, `WebhookProvider`,
    `ProviderContext`).
  - Criar `modules/shared/integrations/registry/` com `providerRegistry`
    (inicialmente vazio/parcial) e `getUserActivitySources(userId)`.
  - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 1.4 Definir a taxonomia canônica de esportes
  - Criar `modules/shared/activities/sport-types/` com `RyvanoSportType` e
    `mapRyvanoSportToLegacy()` (ponte para `lib/sports.ts` e `ReportThemeSport`).
  - _Requisitos: 7.3, 7.4, 7.5_

- [x] 1.5 Definir o contrato NormalizedActivity e proveniência
  - Criar `modules/shared/activities/contracts/` com `NormalizedActivity`,
    `ActivitySource` e `ProviderMetric<T>`.
  - _Requisitos: 7.1, 7.2, 7.8_

- [x] 1.6 Definir o Policy Gate
  - Criar `modules/shared/integrations/policy/` com `ProviderDataPolicy`,
    `PROVIDER_POLICIES` (GARMIN/STRAVA com `allowAiProcessing=false`,
    `allowCrossProviderCombination=false`) e `assertPolicy(providerId, action)`.
  - _Requisitos: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

- [x] 1.7 Definir contrato de requisito de seção de relatório
  - Criar `modules/shared/reports/contracts/` com `ReportSectionRequirement`
    (`{ capability, optional }`).
  - _Requisitos: 9.2_

- [x] 1.8 Testes unitários do core
  - Testar catálogo, `isProviderEnabled`, `hasCapability`/`getUserCapabilities`,
    `assertPolicy` (bloqueia IA e combinação), e mapeamento de `RyvanoSportType`.
  - _Requisitos: 21.1, 15.4, 2.4_

---

## Fase 2 — Modularizar o Garmin (comportamento preservado)

- [x] 2. Criar o esqueleto do módulo Garmin
  - Criar `modules/garmin/` com subpastas (api/client, dto, parsers,
    application, domain, infrastructure, config, database, presentation, tests) e
    `index.ts` vazio.
  - _Requisitos: 5.1_

- [x] 2.1 Mover a camada HTTP e tipos do provider Garmin
  - Mover `server/providers/wearables/garmin.ts` →
    `modules/garmin/api/client/garmin-client.ts` (+ `infrastructure/provider`).
  - Mover os tipos Garmin de `server/providers/wearables/types.ts` para
    `modules/garmin/domain/types.ts`; mover o contrato genérico para
    `modules/shared/integrations/contracts`.
  - _Requisitos: 5.1, 5.5_

- [x] 2.2 Mover o normalizador Garmin e integrar taxonomia canônica
  - Mover `normalizeGarminActivity` → `modules/garmin/parsers/parse-garmin-activity.ts`,
    passando a produzir `NormalizedActivity` (mapeando sportType para
    `RyvanoSportType` via `parse-garmin-sport-type.ts` e preservando
    `providerSportType`).
  - Garantir que o resultado de persistência permaneça equivalente ao atual.
  - _Requisitos: 5.1, 5.2, 7.3, 7.4, 7.5_

- [x] 2.3 Mover os serviços Garmin (application)
  - Mover `garmin-service.ts` → `modules/garmin/application/{connect,sync,
    disconnect,notifications}`; `garmin-daily-report.ts` → `application/daily`;
    `garmin-activity-details.ts` → `application/activities` +
    `presentation/view-models`; `garmin-connection-errors.ts` → `domain/errors`;
    `garmin-notification-events.ts` → `domain/events`;
    `garmin-reporting-settings.ts` → `config`.
  - _Requisitos: 5.1, 5.2_

- [x] 2.4 Quebrar o ciclo de dependência com reporting
  - Extrair a camada genérica de fila/entrega (`enqueue*`/`dispatch*`) para
    `modules/shared/reports` (ou manter em `server/services/reporting.ts` como
    camada compartilhada) e fazer o módulo Garmin depender apenas dela; registrar
    os builders específicos de Garmin (daily/reconnect) via injeção/registro.
  - _Requisitos: 5.1, 5.2, 9.6_

- [x] 2.5 Publicar a superfície pública do módulo e religar consumidores
  - `modules/garmin/index.ts` reexporta as funções usadas por rotas, actions,
    `queries.ts` e admin.
  - Atualizar imports em `app/api/integrations/garmin/**`, `app/actions/*`,
    `server/queries.ts`, `app/admin/*`, páginas e componentes para apontar ao
    módulo (rotas permanecem adapters finos).
  - _Requisitos: 5.3, 5.4_

- [x] 2.6 Ajustar testes e validar paridade
  - Ajustar imports em `tests/garmin-probe.test.ts` (e outros) para o módulo.
  - Rodar `npm run build` + `npm test`; garantir comportamento inalterado.
  - _Requisitos: 5.2, 5.4, 5.6_

---

## Fase 3 — Banco de dados modular e genérico

- [x] 3. Estender enums e conexão genérica no schema
  - Em `prisma/schema.prisma`: adicionar a `SecretType` os valores
    `STRAVA_ACCESS_TOKEN`, `STRAVA_REFRESH_TOKEN` (mantendo os Garmin).
  - Adicionar a `WearableConnection` os campos genéricos ausentes
    (`lastEventAt`, `lastSuccessAt`, `lastErrorAt`).
  - _Requisitos: 6.1, 6.3, 6.5, 3.4_

- [x] 3.1 Adicionar coluna de sport type do provider em Activity
  - Adicionar `providerSportType String?` a `Activity`.
  - _Requisitos: 7.5, 7.1_

- [x] 3.2 Criar tabelas específicas do Strava
  - Adicionar models `StravaConnectionDetails`, `StravaWebhookSubscription`,
    `StravaWebhookEvent`, `StravaActivityCache` (e `StravaStreamCache` só se
    necessário) conforme o design.
  - _Requisitos: 6.2, 12.7, 17.1_

- [x] 3.3 Gerar migração e migração de dados de sportType
  - Criar migração Prisma versionada (aditiva).
  - Escrever passo de migração de dados que converte `Activity.sportType` (string
    Garmin) para `RyvanoSportType` canônico e preenche `providerSportType` com o
    valor original.
  - Rodar `prisma generate`; validar contra a doc oficial da versão instalada.
  - _Requisitos: 6.6, 6.7, 6.8, 7.5_

- [x] 3.4 Ajustar módulo Garmin para persistir sportType canônico
  - Atualizar upsert de atividade do Garmin para gravar `sportType`
    (`RyvanoSportType`) + `providerSportType`.
  - _Requisitos: 7.3, 7.5, 5.2_

---

## Fase 4 — View-models provider-aware (dashboard, atividades, integrações)

- [x] 4. Tornar o dashboard adaptativo
  - Alterar `server/queries.ts::getDashboardData` para carregar todas as conexões
    do usuário e expor `connectedProviders`.
  - Criar `getAvailableDailyInsights(userId)` que consulta capabilities + dados
    via registry (Garmin: snapshot atual).
  - Tornar as seções fisiológicas opcionais; alertas passam a ser contextuais
    (sem citar provider obrigatório).
  - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 4.1 Tornar o detalhe de atividade provider-agnostic
  - Criar `getActivityVisualData(activity)` genérico que monta a visão base pelos
    campos normalizados e enriquece via módulo do provider quando a capability
    existir; nunca retornar `null` só por não ser Garmin.
  - Atualizar `app/app/atividades/[id]/page.tsx`.
  - _Requisitos: 7.7, 7.6_

- [x] 4.2 Consolidar taxonomia de esportes na lista de atividades
  - Substituir `resolveSportTone` e labels duplicados por `RyvanoSportType` +
    `getProviderLabel`; exibir badge de origem.
  - _Requisitos: 7.3, 7.6_

- [x] 4.3 Tela de Integrações a partir do catálogo
  - Criar `IntegrationCardViewModel` e montar os cards a partir do catálogo +
    conexões do usuário; refatorar `IntegrationsHub` para iterar o catálogo
    (mantendo cards WhatsApp/Automações).
  - Implementar `ConnectIntegration(providerId)` genérico (Garmin: modal; Strava:
    placeholder até Fase 5; `COMING_SOON`: desabilitado).
  - _Requisitos: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_

- [x] 4.4 Onboarding multi-provider
  - Tornar o passo de wearable capaz de conectar qualquer provider `AVAILABLE` ou
    pular; garantir conclusão sem provider.
  - _Requisitos: 14.1, 14.2, 14.3_

- [x] 4.5 Testes de view-models multi-provider
  - Testar dashboard/relatório com: sem provider, só Garmin, só Strava (mock),
    ambos; ausência de capability não quebra.
  - _Requisitos: 21.1, 9.3_

---

## Fase 5 — Módulo Strava: OAuth

> Antes de iniciar: consultar [Strava Authentication](https://developers.strava.com/docs/authentication/)
> e confirmar URLs, scopes, formato de token e de resposta.

- [x] 5. Config e ENV do Strava
  - Criar `modules/strava/config/env.ts` (Zod) com client id/secret, URLs,
    verify token, backfill days, flag de reconciliação.
  - Adicionar as variáveis ao `.env.example` e as feature flags de providers.
  - _Requisitos: 19.1, 19.2, 19.3, 10.7_

- [x] 5.1 Esqueleto do módulo Strava e registro no catálogo/registry
  - Criar `modules/strava/` (subpastas do design) e `index.ts`.
  - Definir capabilities reais de STRAVA no catálogo e registrar `stravaModule`
    no `providerRegistry`.
  - _Requisitos: 1.1, 2.5, 4.1, 4.3_

- [x] 5.2 Fluxo de autorização OAuth (state + authorize URL)
  - `modules/strava/auth/oauth.ts`: gerar/validar `state`, montar authorize URL
    com scopes corretos.
  - _Requisitos: 10.1, 10.2, 10.7_

- [x] 5.3 Troca de código por token
  - `modules/strava/auth/token-exchange.ts`: POST token URL, validar resposta
    (Zod), extrair `athlete.id`, scopes concedidos, `expires_at`.
  - Persistir `WearableConnection` (STRAVA) + `StravaConnectionDetails` + secrets
    criptografados.
  - _Requisitos: 10.3, 10.4, 6.2, 6.4, 20.1, 20.2_

- [x] 5.4 Refresh de token e revoke
  - `token-refresh.ts`: refresh com rotação persistida e lock anti-concorrência.
  - `revoke.ts`: revoke no disconnect + limpeza de secrets/detalhes, sem afetar
    outros providers.
  - _Requisitos: 10.5, 10.6, 3.6_

- [x] 5.5 Rotas OAuth (adapters finos)
  - `app/api/integrations/strava/connect/route.ts` (inicia OAuth) e
    `app/api/integrations/strava/callback/route.ts` (troca token) e
    `app/api/integrations/strava/disconnect/route.ts`.
  - _Requisitos: 10.1, 10.6, 13.7_

- [x] 5.6 Testes de OAuth
  - state válido/inválido, access denied, scope parcial, refresh, refresh
    concorrente, refresh token rotacionado (HTTP mockado; fixtures sanitizadas).
  - _Requisitos: 21.2, 21.3_

---

## Fase 6 — Módulo Strava: API client e sincronização

> Antes: consultar [API Reference](https://developers.strava.com/docs/reference/)
> e [Rate Limits](https://developers.strava.com/docs/rate-limits/).

- [x] 6. Implementar o StravaClient
  - `modules/strava/api/client/strava-client.ts`: base URL, Bearer, timeout,
    refresh em 401, backoff em 429, parsing de erro, observabilidade, sem expor
    secrets.
  - _Requisitos: 11.1, 11.5, 20.3, 20.4_

- [x] 6.1 DTOs e schemas Zod
  - `api/dto/` (athlete, summary/detailed activity, lap, stream set, webhook
    event, fault) e `api/schemas/` (validação runtime).
  - _Requisitos: 11.2, 11.3_

- [x] 6.2 Parsers Strava → NormalizedActivity
  - `parsers/parse-strava-activity.ts`, `parse-strava-sport-type.ts`
    (→ `RyvanoSportType`), `parse-strava-token-response.ts`.
  - DTO remoto nunca vai direto à UI/domínio.
  - _Requisitos: 11.4, 7.1, 7.4, 7.5_

- [x] 6.3 Rate limit por módulo
  - `modules/strava/infrastructure/rate-limit/` respeitando limites oficiais.
  - _Requisitos: 11.7, 18.4_

- [x] 6.4 Sync e backfill inicial
  - `application/sync`: backfill de `STRAVA_INITIAL_BACKFILL_DAYS` ao conectar;
    upsert idempotente em `Activity` (`provider+externalId+userId`).
  - Chamar `assertPolicy(STRAVA, "persist")` antes de persistir.
  - _Requisitos: 11.6, 15.3, 16.2, 18.1_

- [x] 6.5 Testes de API/sync
  - 200/401/403/404/429/5xx/timeout/payload parcial/campo opcional ausente;
    backfill; idempotência.
  - _Requisitos: 21.2, 21.4_

---

## Fase 7 — Módulo Strava: Webhook

> Antes: consultar [Webhooks](https://developers.strava.com/docs/webhooks/).

- [x] 7. Rota e validação de webhook
  - `app/api/integrations/strava/webhook/route.ts` (GET challenge + POST evento),
    adapters finos para `modules/strava/webhooks`.
  - GET valida `hub.verify_token` contra `STRAVA_WEBHOOK_VERIFY_TOKEN` e ecoa
    `hub.challenge`.
  - POST valida payload (Zod), persiste `StravaWebhookEvent(PENDING)`, responde
    rápido.
  - _Requisitos: 12.1, 12.2, 12.3, 12b.1, 12b.2, 20.5_

- [x] 7.1 Processor de eventos (idempotente)
  - `webhooks/processor.ts`: resolve conexão por `owner_id`/athleteId; ignora
    atleta desconhecido/duplicado; para create/update busca o recurso via API (se
    permitido) → normaliza → upsert `Activity`; retry/backoff; marca PROCESSED/
    FAILED.
  - _Requisitos: 12.4, 12.5, 12.6, 18.3_

- [x] 7.2 Gestão da subscription
  - `StravaWebhookSubscription`: rotina/script admin para criar, verificar e
    apagar subscription da aplicação.
  - _Requisitos: 12.7_

- [x] 7.3 Delete e deauthorization
  - `delete` → `purgeDeletedActivityData`; `deauthorization` →
    `purgeDeauthorizedUserData` (sem afetar outros providers).
  - _Requisitos: 12.4, 17.3, 17.4_

- [x] 7.4 Testes de webhook
  - challenge, create/update/delete, deauthorization, duplicado, atleta
    desconhecido, payload inválido.
  - _Requisitos: 21.2_

---

## Fase 8 — Retenção, cleanup, jobs e Strava na UI

- [x] 8. Cleanup e retenção Strava
  - `application/cleanup`: `purgeExpiredActivityCache`, `purgeExpiredStreams`,
    `purgeExpiredWebhookPayloads`, `purgeDeauthorizedUserData`,
    `purgeDeletedActivityData`; TTL conforme política.
  - _Requisitos: 17.1, 17.2, 17.5_

- [x] 8.1 Jobs por módulo e orquestração
  - `application/sync` do Strava e processor de webhook acionáveis por job;
    manter jobs Garmin separados; orquestrador genérico apenas onde necessário;
    falha de um provider não interrompe os demais.
  - _Requisitos: 18.1, 18.2, 18.3, 18.4_

- [x] 8.2 Componente de conexão Strava e ativação do card
  - `modules/strava/presentation/components`: botão "Conectar com Strava"
    (redireciona ao OAuth) e tela de gerenciamento (status, scopes, desconectar).
  - Ativar a ação real do card Strava na tela de Integrações (substituir o
    placeholder da Fase 4).
  - _Requisitos: 13.3, 13.4, 13.7, 13.8_

- [x] 8.3 Origem/badges de Strava em atividades e dashboard
  - Garantir source badge "Strava" nas atividades e que o dashboard exiba dados
    de volume do Strava; detalhe de atividade Strava funcional.
  - _Requisitos: 7.6, 7.7, 8.2_

- [x] 8.4 Testes de retenção/cleanup
  - TTL, cleanup, delete, deauthorization.
  - _Requisitos: 21.2_

---

## Fase 9 — Relatórios adaptativos, reconciliação (bloqueada) e conformidade

- [x] 9. Relatórios provider-agnostic por capability
  - Aplicar `ReportSectionRequirement` no report builder; omitir seções sem
    dado/capability sem falhar; relatório pós-atividade para qualquer provider.
  - Ajustar `MessageDelivery.type` para nomes genéricos com compatibilidade
    retroativa (materializer aceita prefixos antigos e novos).
  - _Requisitos: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 9.1 Camada de reconciliação (desabilitada por padrão)
  - Criar `modules/shared/activities/reconciliation/` com contrato
    `ActivityMatchCandidate`/`MetricComparison`; gating por
    `STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED` (default false) +
    `assertPolicy(..., "combine")`.
  - Garantir que usuários com um provider não dependam dela e que não haja merge
    automático.
  - _Requisitos: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 15.6_

- [ ] 9.2 Reforçar o bloqueio de IA e compartilhamento
  - Garantir que qualquer caminho de envio de dados a IA/terceiros chame
    `assertPolicy` e seja bloqueado para Strava (e Garmin) enquanto proibido.
  - _Requisitos: 15.4, 15.5, 20.1_
  - NOTA: Removido intencionalmente a pedido do responsável — a Ryvano não possui integrações com IA; o mecanismo de bloqueio de IA/compartilhamento (ações `ai`/`share` do Policy Gate e helpers) foi removido do código. `persist`/`combine` permanecem.

- [x] 9.3 Observabilidade por conexão
  - Logs com provider/operation/connection_id/status; métricas rotuladas por
    provider (requests/errors/sync/webhooks/token refresh); sem vazar secrets/PII.
  - _Requisitos: 20.1, 20.2, 20.3, 20.4_

- [x] 9.4 Matriz de testes multi-provider (fechamento)
  - Cobrir todos os cenários do Requisito 21.1 (sem provider; só Garmin; só
    Strava; ambos; falhas isoladas; desconexão independente; ausência de
    capability não quebra).
  - _Requisitos: 21.1, 21.4_

- [x] 9.5 Documentação e regras de integração
  - Adicionar a seção "Integrações esportivas" ao `AGENTS.md` com as regras
    multi-provider e o checklist obrigatório de docs oficiais.
  - _Requisitos: 22.1, 22.2, 22.3_

- [x] 9.6 Verificação final e Definition of Done
  - Rodar `npm run build`, `npm test` e `npm run lint`.
  - Validar a Definition of Done (core multi-provider, Garmin modular, Strava) de
    `requirements.md`.
  - _Requisitos: todos (fechamento)_
