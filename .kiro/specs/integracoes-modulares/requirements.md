# Requirements — Arquitetura Modular de Integrações Esportivas

## Introdução

A Ryvano hoje é uma aplicação acoplada ao Garmin: apesar de o schema Prisma já
prever `WearableProvider` multi-valor, toda a camada de serviços, UI, server
actions, dashboard e relatórios assume que Garmin é o único provedor conectado.

Este spec transforma a Ryvano em uma plataforma multi-provider, na qual um
usuário pode ter **0..N integrações** (nenhuma, só Garmin, só Strava, Garmin +
Strava, ou qualquer combinação futura de Polar, COROS, Suunto, Fitbit). O
objetivo é que "provider seja plugin, Ryvano seja produto": nenhum módulo do
core pode depender de um provider específico, e adicionar um novo provider deve
significar principalmente criar `modules/<provider>/` e registrá-lo no catálogo.

Este documento é derivado de `RYVANO_ARQUITETURA_INTEGRACOES_MODULARES.md` (108
seções) e da análise do código atual. Ele cobre da preparação do core à
implementação completa de Strava (OAuth, API, webhook, UI, relatórios), passando
pela modularização do Garmin, banco modular, políticas de dados, retenção,
observabilidade e testes.

### Regra transversal obrigatória

Antes de implementar ou alterar qualquer endpoint, DTO, scope, webhook,
autenticação, payload, retenção, política de uso ou campo retornado por qualquer
provider, o desenvolvedor/agente **deve consultar a documentação oficial vigente
do provider**. Este spec orienta a implementação, mas não substitui a
documentação oficial.

### Restrições legais/contratuais já conhecidas (Strava)

- Dados de um usuário Strava só podem ser exibidos/divulgados para o próprio
  usuário no aplicativo. Dados de terceiros, mesmo públicos, não podem ser
  exibidos/divulgados. (Content was rephrased for compliance with licensing restrictions — fonte: [Strava API Agreement](https://www.strava.com/legal/api))
- É proibido usar dados extraídos de usuários Strava para treinar modelos de IA.
  (fonte: [Strava API Agreement Update](https://communityhub.strava.com/developers-api-7/api-agreement-update-how-data-appears-on-3rd-party-apps-7636))
- Por isso, reconciliação/combinação de dados entre providers e uso de dados
  Strava em IA/LLM permanecem **desabilitados por padrão** neste spec.

---

## Glossário

- **Provider**: provedor esportivo externo (GARMIN, STRAVA, POLAR, ...).
- **Capability**: capacidade declarada por um provider (activities, sleep, hrv,
  webhooks, etc.), usada pelo core em vez de `if (provider === "X")`.
- **Catálogo**: lista central de providers suportados, com disponibilidade e
  capabilities.
- **Registry**: mapa `ProviderId -> módulo` para seleção dinâmica de provider.
- **NormalizedActivity**: atividade em formato canônico da Ryvano,
  provider-agnostic, preservando `source` e `providerSportType`.
- **Policy Gate**: camada que decide, por provider, o que pode ser persistido,
  combinado, compartilhado ou enviado a IA.
- **Reconciliação**: comparação entre representações da mesma atividade em
  providers diferentes (camada opcional, bloqueada por padrão).

---

## Requisitos

### Requisito 1 — Catálogo central de providers

**User Story:** Como equipe de produto, quero um catálogo central e extensível de
providers, para que a Ryvano exiba e trate cada integração pela sua
disponibilidade e capacidades sem espalhar condicionais por provider.

#### Acceptance Criteria

1. QUANDO o core precisar da lista de providers suportados, ENTÃO o sistema DEVE
   fornecer um catálogo central contendo, para cada provider: `id` (ProviderId),
   `name`, `description`, `availability` e `capabilities`.
2. O sistema DEVE definir `ProviderId` cobrindo pelo menos `GARMIN`, `STRAVA`,
   `POLAR`, `COROS`, `SUUNTO`, `FITBIT`, alinhado ao enum Prisma `WearableProvider`.
3. O sistema DEVE definir `ProviderAvailability` com pelo menos `AVAILABLE`,
   `COMING_SOON`, `DISABLED` (e opcionalmente `PRIVATE_BETA`).
4. No estado inicial, o catálogo DEVE marcar GARMIN e STRAVA como `AVAILABLE` e
   POLAR, COROS, SUUNTO, FITBIT como `COMING_SOON`.
5. QUANDO um provider estiver `COMING_SOON`, ENTÃO o sistema NÃO DEVE exigir a
   existência de um módulo implementado para ele.
6. O catálogo DEVE distinguir "provider existe no catálogo" de "provider está
   liberado", permitindo controle de liberação via disponibilidade e/ou feature flag.
7. QUANDO um provider não estiver `AVAILABLE`, ENTÃO o sistema NÃO DEVE permitir
   iniciar um fluxo de conexão real para ele.

### Requisito 2 — Capabilities em vez de suposições por provider

**User Story:** Como desenvolvedor do core, quero decidir funcionalidades por
capability declarada, para que novos providers sejam adicionados sem alterar
todos os componentes.

#### Acceptance Criteria

1. O sistema DEVE definir um contrato `ProviderCapabilities` cobrindo pelo menos:
   `activities`, `activityDetails`, `dailyWellness`, `recovery`, `sleep`, `hrv`,
   `readiness`, `streams`, `laps`, `webhooks`, `oauth`.
2. QUANDO o core decidir se renderiza ou processa uma funcionalidade baseada em
   dados (ex.: sono, HRV, volume), ENTÃO ele DEVE consultar a capability
   correspondente do(s) provider(s) conectado(s), NÃO o identificador do provider.
3. Decisões sobre protocolo/transporte específico (ex.: como fazer refresh de
   token) PODEM depender do provider dentro do respectivo módulo, mas decisões
   sobre capacidade de dado NÃO DEVEM.
4. QUANDO nenhum provider conectado fornecer uma capability exigida por uma
   funcionalidade opcional, ENTÃO o sistema DEVE ocultar/omitir essa
   funcionalidade em vez de falhar.
5. As capabilities de GARMIN e STRAVA DEVEM ser definidas conforme a
   documentação oficial vigente de cada um.

### Requisito 3 — Conexões 0..N por usuário e status por conexão

**User Story:** Como usuário, quero conectar nenhuma, uma ou várias integrações,
para usar a Ryvano com os serviços que eu tenho, sem exigência de um provider
específico.

#### Acceptance Criteria

1. O sistema DEVE suportar que um usuário tenha 0..N conexões de integração, uma
   por provider disponível (mantendo `@@unique([userId, provider])` enquanto a
   regra for "no máximo uma conta por provider").
2. O sistema NÃO DEVE armazenar flags por provider na tabela `User` (ex.:
   `garminConnected`, `stravaConnected`).
3. QUANDO um usuário não tiver nenhuma integração, ENTÃO o sistema DEVE permitir
   onboarding e uso da conta, exibindo chamadas para conectar um provider.
4. O sistema DEVE manter estado independente por conexão, incluindo pelo menos
   um status de conexão (`CONNECTED`, `DEGRADED`/`ERROR`, `REAUTH_REQUIRED`/
   `RECONNECT_REQUIRED`, `DISCONNECTED`) e marcações de sincronização/eventos
   (`lastSyncAt`, `lastEventAt`, `lastSuccessAt`/`lastErrorAt` ou equivalentes).
4. O sistema NÃO DEVE manter um único status global de integrações no usuário.
5. QUANDO uma conexão de um provider falhar, ENTÃO as conexões de outros
   providers do mesmo usuário DEVEM permanecer operacionais (falha parcial não
   derruba as demais).
6. QUANDO um usuário desconectar um provider, ENTÃO os demais providers conectados
   DEVEM permanecer conectados e funcionais.

### Requisito 4 — Registry de providers e seleção dinâmica

**User Story:** Como desenvolvedor do core, quero um registry que mapeie
`ProviderId` para o módulo do provider, para orquestrar conexão e sincronização
sem hardcodar cada provider.

#### Acceptance Criteria

1. O sistema DEVE fornecer um registry `ProviderId -> módulo do provider` no core.
2. QUANDO o core precisar operar sobre as fontes de atividade de um usuário,
   ENTÃO ele DEVE obter a lista de providers conectados e tratar cada um via
   registry, em vez de referenciar `garminProvider`/`stravaProvider` diretamente.
3. QUANDO um novo provider for adicionado ao registry, ENTÃO o core NÃO DEVE
   exigir alterações no código dos módulos de providers já existentes.
4. O contrato compartilhado de provider DEVE ser composto por interfaces pequenas
   e opcionais (ex.: `ActivityProvider`, `RecoveryProvider`, `SleepProvider`,
   `StreamProvider`, `WebhookProvider`), evitando uma interface única que force
   todos os providers a implementar tudo.
5. O contrato compartilhado NÃO DEVE exigir métodos específicos de um protocolo
   (ex.: `getOAuthUrl()`) de todos os providers; o tipo de autenticação DEVE ser
   uma capability (`OAUTH2` | `CREDENTIALS` | `API_KEY` | `OTHER`).

### Requisito 5 — Modularização do Garmin com comportamento preservado

**User Story:** Como mantenedor, quero mover a lógica Garmin para
`modules/garmin/` preservando o comportamento atual, para reduzir acoplamento sem
introduzir regressões.

#### Acceptance Criteria

1. O sistema DEVE mover a lógica Garmin hoje em `server/providers/wearables/garmin.ts`,
   `server/services/garmin-*.ts` e `server/garmin-reporting-settings.ts` para
   `modules/garmin/**`, organizada em camadas (api/client, dto, parsers,
   application, domain, infrastructure, database, presentation, config).
2. QUANDO a modularização for concluída, ENTÃO o comportamento observável do
   Garmin (connect, sync, probe em lote, revalidação, notificação de reconexão,
   snapshot diário, detalhe de atividade) DEVE permanecer idêntico.
3. As rotas em `app/api/integrations/garmin/**` DEVEM permanecer como adapters
   finos, apenas delegando para funções do módulo.
4. Os testes existentes (`tests/garmin-probe.test.ts` e demais) DEVEM continuar
   passando após a migração (ajustando apenas os caminhos de import).
5. Nenhum código específico de Strava DEVE existir dentro do módulo Garmin.
6. A modularização estrutural NÃO DEVE ser acompanhada de mudanças de
   comportamento Garmin no mesmo passo; alterações de comportamento, se
   necessárias, DEVEM vir em passos separados.

### Requisito 6 — Banco de dados modular e genérico

**User Story:** Como mantenedor de dados, quero um schema genérico multi-provider
com detalhes específicos isolados, para suportar novos providers sem inflar a
tabela de conexão.

#### Acceptance Criteria

1. `WearableConnection` DEVE conter apenas campos genéricos e NÃO DEVE ganhar
   colunas específicas de provider (ex.: `garminEmail`, `stravaScopes`,
   `stravaTokenExpiresAt`, `stravaSubscriptionId`).
2. Detalhes específicos de provider DEVEM ficar em tabelas próprias do módulo
   (ex.: `StravaConnectionDetails`, e futuramente `GarminConnectionDetails` se
   necessário), relacionadas 1:1 com `WearableConnection`.
3. O enum `WearableProvider` DEVE permanecer preparado para expansão; o fato de
   um valor existir na enum NÃO significa que a integração está habilitada.
4. Tokens e segredos NÃO DEVEM ser armazenados em texto puro; DEVEM usar o
   `WearableSecret` criptografado (AES-256-GCM) OU tabela específica do módulo com
   criptografia equivalente.
5. `SecretType` DEVE ser estendido para cobrir os segredos do Strava (ex.:
   `STRAVA_ACCESS_TOKEN`, `STRAVA_REFRESH_TOKEN`) sem quebrar os segredos Garmin.
6. As identidades de atividade DEVEM continuar usando
   `provider + externalId + userId` como chave, nunca `externalId` isolado.
7. A configuração de Prisma multi-file, SE adotada, DEVE ser validada contra a
   documentação oficial da versão instalada (Prisma 6) antes de qualquer alteração.
8. Toda alteração de schema DEVE ser acompanhada de migração Prisma versionada e
   compatível com dados existentes.

### Requisito 7 — Atividades provider-agnostic e taxonomia canônica de esportes

**User Story:** Como usuário, quero ver minhas atividades de qualquer provider
com a origem preservada, para confiar de onde veio cada dado.

#### Acceptance Criteria

1. O sistema DEVE definir um contrato `NormalizedActivity` provider-agnostic
   contendo pelo menos: `source` (ProviderId), `externalId`, `sportType`
   (canônico), `providerSportType` (original), `startedAt`, e campos opcionais de
   métricas (duração, distância, FC, velocidade, elevação, cadência, potência).
2. Nenhuma propriedade específica de um provider DEVE ser obrigatória no contrato
   compartilhado de atividade.
3. O sistema DEVE definir uma taxonomia canônica única de esportes
   (`RyvanoSportType`) consumida pelas telas e relatórios, substituindo/consolidando
   as taxonomias hoje duplicadas em 5+ lugares.
4. Cada provider DEVE ter seu próprio mapeador de sport type
   (`modules/<provider>/parsers/parse-<provider>-sport-type.ts`) que converte o
   tipo do provider para `RyvanoSportType`.
5. O sistema DEVE preservar `providerSportType` além do tipo canônico, para
   permitir corrigir mapeamentos no futuro sem perder o valor original.
6. QUANDO uma atividade for exibida (lista, detalhe, dashboard), ENTÃO o sistema
   DEVE mostrar a origem (source) quando for relevante, via label/badge.
7. A página de detalhe de atividade NÃO DEVE renderizar vazio para atividades de
   providers diferentes de Garmin; ela DEVE exibir os dados normalizados
   disponíveis para qualquer provider, e enriquecer com dados específicos do
   provider apenas quando a capability existir.
8. Cada métrica importada DEVE preservar sua proveniência (provider, id da
   atividade no provider, momento da coleta) de forma que dois providers possam
   registrar valores diferentes para o mesmo treino sem sobrescrita silenciosa.

### Requisito 8 — Dashboard adaptativo

**User Story:** Como usuário, quero um dashboard que se adapte aos meus dados
disponíveis, para não ver erros ou seções vazias de dados que não tenho.

#### Acceptance Criteria

1. O dashboard NÃO DEVE ter composição fixa baseada em Garmin.
2. QUANDO o usuário tiver apenas Strava conectado, ENTÃO o dashboard DEVE exibir
   informações derivadas de atividades (volume, frequência, distância, tendências
   permitidas) SEM exibir mensagens como "HRV indisponível" ou "Conecte Garmin"
   como bloqueio.
3. QUANDO o usuário tiver apenas Garmin conectado, ENTÃO o dashboard DEVE exibir
   as seções fisiológicas (readiness, HRV, sono, Body Battery) alimentadas por Garmin.
4. QUANDO o usuário não tiver nenhuma integração, ENTÃO o dashboard DEVE
   funcionar e exibir chamadas contextuais e opcionais para conectar um provider.
5. O view-model do dashboard DEVE expor `connectedProviders` e tornar todas as
   seções dependentes de dado como opcionais (renderizadas somente se houver dado).
6. As mensagens/alertas do dashboard NÃO DEVEM citar um provider específico como
   obrigatório; chamadas para conectar DEVEM ser contextuais.

### Requisito 9 — Relatórios adaptativos por capability

**User Story:** Como usuário, quero relatórios que só incluam seções para as
quais existem dados, para receber relatórios coerentes com qualquer provider.

#### Acceptance Criteria

1. O report builder NÃO DEVE exigir campos exclusivos de Garmin (Body Battery,
   Training Readiness, HRV, sleep) como obrigatórios.
2. Cada seção de relatório DEVE declarar seus requisitos de capability
   (`{ capability, optional }`).
3. QUANDO nenhum provider conectado fornecer a capability exigida por uma seção,
   ENTÃO a seção NÃO DEVE ser renderizada, e o relatório NÃO DEVE falhar por causa
   disso.
4. O relatório pós-atividade DEVE funcionar para atividades de qualquer provider
   (com base nos campos normalizados), exibindo a origem quando relevante.
5. As seções fisiológicas diárias (readiness/HRV/sono/Body Battery) DEVEM ser
   condicionadas às capabilities e à disponibilidade de dado do provider.
6. A camada de fila/entrega (`MessageDelivery`) DEVE evoluir para nomes de tipo
   provider-agnostic OU manter compatibilidade retroativa com os tipos existentes,
   sem quebrar entregas em andamento.

### Requisito 10 — Módulo Strava: OAuth

**User Story:** Como usuário, quero conectar minha conta Strava via OAuth, para
importar minhas atividades do Strava.

#### Acceptance Criteria

1. O sistema DEVE implementar o fluxo OAuth 2.0 do Strava em `modules/strava/auth/`
   conforme a documentação oficial vigente ([Strava Authentication](https://developers.strava.com/docs/authentication/)).
2. QUANDO o usuário iniciar a conexão, ENTÃO o sistema DEVE gerar e validar um
   `state` para proteção contra CSRF.
3. QUANDO o callback for recebido com sucesso, ENTÃO o sistema DEVE trocar o
   `code` por tokens, validar a resposta, salvar `athleteId`, salvar os scopes
   efetivamente concedidos, e criptografar access token e refresh token.
4. QUANDO o Strava conceder apenas parte dos scopes solicitados, ENTÃO o sistema
   DEVE registrar os scopes concedidos e adaptar o comportamento ao que foi
   autorizado.
5. O sistema DEVE centralizar o refresh de token em `modules/strava/auth/token-refresh.ts`,
   persistindo o refresh token novo quando rotacionado, e evitando refresh
   concorrente do mesmo usuário.
6. QUANDO o usuário desconectar o Strava, ENTÃO o sistema DEVE revogar/limpar
   tokens e marcar a conexão como desconectada, sem afetar outros providers.
7. As URLs de OAuth e API do Strava DEVEM vir de configuração/ENV
   (`modules/strava/config/env.ts`), não hardcoded espalhado.

### Requisito 11 — Módulo Strava: API client e sincronização

**User Story:** Como usuário, quero que minhas atividades do Strava sejam
importadas e mantidas atualizadas, para vê-las na Ryvano.

#### Acceptance Criteria

1. O sistema DEVE implementar um `StravaClient` em `modules/strava/api/client/`
   responsável por base URL, Bearer token, timeout, refresh, parsing de erro,
   rate limit, retry seguro e observabilidade, sem expor secrets.
2. O sistema DEVE implementar apenas os endpoints necessários inicialmente
   (athlete, listar atividades, detalhe da atividade; streams/laps somente quando
   necessários), confirmados na documentação oficial vigente.
3. Todo DTO remoto DEVE ser validado em runtime (schemas Zod em
   `modules/strava/api/schemas/`) antes de virar contrato interno.
4. DTO remoto NÃO DEVE atravessar diretamente para domínio/UI; DEVE passar por
   parser (`modules/strava/parsers/`) que produz `NormalizedActivity`.
5. QUANDO o Strava retornar 401/403/429/5xx/timeout ou payload parcial, ENTÃO o
   client DEVE tratar o erro adequadamente (refresh em 401 quando aplicável,
   backoff em 429, marcação de estado da conexão) sem quebrar outros providers.
6. O backfill inicial ao conectar DEVE ser configurável por
   `STRAVA_INITIAL_BACKFILL_DAYS` e ser uma decisão do módulo Strava.
7. Os rate limits DEVEM ser tratados por provider (`modules/strava/infrastructure/rate-limit/`),
   sem um número global único.

### Requisito 12 — Módulo Strava: Webhook

**User Story:** Como usuário, quero que atividades criadas/atualizadas/excluídas
no Strava reflitam na Ryvano em tempo hábil, para não depender de sincronização
manual.

#### Acceptance Criteria

1. O sistema DEVE implementar o webhook do Strava em `modules/strava/webhooks/`
   (validation, handler, processor, dto) e a rota HTTP em
   `app/api/integrations/strava/webhook/route.ts` como adapter fino.
2. QUANDO o Strava enviar o desafio de verificação (GET), ENTÃO a rota DEVE
   responder ao challenge conforme a documentação oficial vigente.
3. QUANDO um evento (POST) for recebido, ENTÃO a rota DEVE validar, registrar o
   evento e responder rapidamente, deixando o processamento pesado fora do request.
4. O sistema DEVE processar eventos `create`, `update`, `delete` de atividade e
   `deauthorization` do atleta.
5. O processamento de eventos DEVE ser idempotente, usando
   `provider + externalId + user/connection` como identidade mínima.
6. QUANDO o webhook indicar um evento de atividade, ENTÃO o sistema DEVE buscar o
   recurso completo via API somente se necessário e permitido, confirmando o DTO
   oficial vigente.
7. O sistema DEVE gerenciar o estado da subscription da aplicação
   (`StravaWebhookSubscription`), tratando a subscription como sendo da aplicação
   (não uma por atleta, salvo indicação oficial em contrário).

### Requisito 12b — Verificação de assinatura de webhook

Nota: Diferentemente do Evolution (que usa segredo de webhook), o Strava não
assina os POSTs de evento; a proteção do challenge se dá pelo `verify_token`
definido na criação da subscription. Portanto:

#### Acceptance Criteria

1. QUANDO o challenge GET chegar, ENTÃO o sistema DEVE validar o
   `hub.verify_token` contra `STRAVA_WEBHOOK_VERIFY_TOKEN`.
2. QUANDO um POST de evento chegar, ENTÃO o sistema DEVE validar a estrutura do
   payload e associar o evento a uma conexão conhecida pelo `owner_id`/athleteId,
   descartando eventos de atletas desconhecidos.

### Requisito 13 — Tela de Integrações multi-provider

**User Story:** Como usuário, quero uma tela de integrações que mostre o que está
conectado, o que está disponível e o que virá em breve, para gerenciar minhas
conexões de forma clara.

#### Acceptance Criteria

1. A tela de integrações DEVE ser renderizada a partir do catálogo de providers,
   não de cards hardcoded, exibindo três grupos: conectadas, disponíveis e "em breve".
2. O sistema DEVE fornecer um view-model genérico por card
   (`IntegrationCardViewModel`) com `provider`, `name`, `description`,
   `availability`, `connected`, `status`, datas e uma `action`
   (`CONNECT` | `MANAGE` | `RECONNECT` | `COMING_SOON`).
3. QUANDO um provider estiver `AVAILABLE` e desconectado, ENTÃO o card DEVE
   oferecer `CONNECT`.
4. QUANDO um provider estiver conectado, ENTÃO o card DEVE oferecer `MANAGE`
   (e `RECONNECT` quando o status exigir).
5. QUANDO um provider estiver `COMING_SOON`, ENTÃO o card DEVE exibir "Em breve"
   sem ação de conexão.
6. QUANDO o usuário tiver Strava conectado e Garmin não, ENTÃO a tela DEVE parecer
   natural (Strava conectado, Garmin com "Conectar"), sem tratar Garmin como
   obrigatório — e vice-versa.
7. O fluxo de conexão DEVE ser genérico (`ConnectIntegration(providerId)`),
   delegando ao módulo correto via registry; cada módulo decide seu protocolo.
8. A UI NÃO DEVE precisar conhecer detalhes de OAuth de cada provider.

### Requisito 14 — Onboarding multi-provider

**User Story:** Como novo usuário, quero poder concluir o onboarding sem
conectar um provider específico, para começar a usar a Ryvano e conectar depois.

#### Acceptance Criteria

1. O onboarding NÃO DEVE exigir conexão de Garmin (nem de qualquer provider
   específico) para ser concluído.
2. QUANDO o usuário estiver no passo de wearable do onboarding, ENTÃO ele DEVE
   poder conectar qualquer provider `AVAILABLE` ou pular e conectar depois.
3. QUANDO o usuário optar por não conectar, ENTÃO o onboarding DEVE concluir e a
   conta DEVE ficar utilizável.

### Requisito 15 — Policy Gate por provider (armazenamento, combinação, IA)

**User Story:** Como responsável por conformidade, quero uma camada que aplique
as políticas de cada provider, para impedir arquiteturalmente usos não
permitidos de dados.

#### Acceptance Criteria

1. O sistema DEVE fornecer um Policy Gate por provider em
   `modules/shared/integrations/policy/`, com um contrato `ProviderDataPolicy`
   cobrindo pelo menos `allowPersistentStorage`, `maxCacheAgeSeconds`,
   `allowCrossProviderCombination`, `allowAiProcessing`, `allowThirdPartyDisclosure`.
2. Cada política DEVE ser baseada na documentação oficial vigente do provider.
3. QUANDO uma operação de persistência, combinação, compartilhamento ou envio a
   IA for solicitada para dados de um provider, ENTÃO ela DEVE passar pelo Policy
   Gate e ser bloqueada se a política não permitir.
4. O sistema NÃO DEVE enviar dados Strava para IA/LLM/embeddings/RAG/memória de
   agente/treinamento enquanto a política vigente proibir; essa restrição DEVE ser
   imposta arquiteturalmente pelo módulo/policy, não apenas por convenção.
5. O sistema NÃO DEVE assumir que dados Garmin podem ter qualquer uso; usos com
   IA/compartilhamento DEVEM passar pelo mesmo Policy Gate.
6. A combinação/reconciliação entre providers DEVE ser controlada por
   `STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED` (default `false`) e pela política.

### Requisito 16 — Reconciliação multi-provider (bloqueada por padrão)

**User Story:** Como arquiteto, quero deixar espaço para reconciliação entre
providers sem habilitá-la, para não transformar possibilidade técnica em
permissão legal.

#### Acceptance Criteria

1. O sistema DEVE preservar as representações de cada provider sem mesclá-las
   automaticamente.
2. QUANDO a mesma atividade existir em mais de um provider, ENTÃO o sistema NÃO
   DEVE sobrescrever silenciosamente uma métrica com a de outro provider.
3. A reconciliação (detecção de correspondência, confidence, comparação de
   métricas) DEVE residir em uma camada separada (`modules/shared/.../reconciliation`)
   e permanecer desabilitada por padrão.
4. Usuários com apenas um provider NÃO DEVEM depender da camada de reconciliação.
5. A prioridade entre providers NÃO DEVE ser global fixa ("Garmin sempre vence");
   quando existir, DEVE ser explícita e por métrica/contexto.
6. Preferência do usuário por fonte só DEVE ser implementada quando houver
   necessidade real; a arquitetura DEVE permitir, sem entregar agora.

### Requisito 17 — Retenção, cache e limpeza (Strava)

**User Story:** Como responsável por dados, quero limpeza e TTL para dados
Strava, para cumprir a política de retenção.

#### Acceptance Criteria

1. O sistema DEVE tratar caches Strava (atividade e streams) como transitórios,
   com TTL e sem virar histórico permanente indevido.
2. O sistema DEVE implementar rotinas de limpeza em
   `modules/strava/application/cleanup/`: expiração de cache de atividade, de
   streams, de payloads de webhook, remoção de dados de usuário desautorizado e de
   atividade excluída.
3. QUANDO um atleta desautorizar a aplicação, ENTÃO o sistema DEVE remover/
   inutilizar os dados Strava daquele usuário, sem afetar dados de outros providers.
4. QUANDO uma atividade for excluída no Strava, ENTÃO o sistema DEVE remover/
   inutilizar os dados Strava relacionados sem apagar atividades legítimas de
   outros providers.
5. A retenção DEVE seguir a política oficial vigente do Strava.

### Requisito 18 — Jobs, sincronização independente e falha parcial

**User Story:** Como operador, quero que cada provider sincronize pela sua
estratégia e que falhas sejam isoladas, para manter o sistema resiliente.

#### Acceptance Criteria

1. Cada conexão DEVE ter marcações próprias de sincronização/eventos
   (`lastSyncAt`, `lastEventAt`, `lastSuccessAt`, `lastErrorAt` ou equivalentes).
2. Os jobs de sincronização DEVEM ser por módulo
   (`modules/<provider>/application/sync/`), com um orquestrador genérico apenas
   quando necessário, evitando um único job com muitas condicionais.
3. QUANDO um provider falhar em uma execução de job, ENTÃO os demais providers
   DEVEM continuar sendo processados.
4. Garmin PODE sincronizar por polling/probe (estratégia atual); Strava PODE
   operar principalmente por webhook; a arquitetura DEVE acomodar estratégias
   diferentes por provider.

### Requisito 19 — Configuração e ENV por módulo

**User Story:** Como desenvolvedor, quero que cada módulo valide seu próprio ENV,
para não espalhar `process.env` pelo código.

#### Acceptance Criteria

1. Cada módulo DEVE validar seu ENV em `modules/<provider>/config/env.ts`.
2. O código NÃO DEVE acessar `process.env.STRAVA_*` (nem equivalentes) diretamente
   em vários arquivos; o acesso DEVE ser centralizado na config do módulo.
3. O sistema DEVE adicionar ao `.env.example` as variáveis Strava
   (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, URLs de OAuth/API/webhook,
   `STRAVA_WEBHOOK_VERIFY_TOKEN`, `STRAVA_INITIAL_BACKFILL_DAYS`,
   `STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED`) e as feature flags de providers.
4. Variáveis de providers futuros são apenas convenção e NÃO DEVEM ser criadas de
   fato até confirmar o modelo de autenticação na documentação oficial.

### Requisito 20 — Segurança e observabilidade por conexão

**User Story:** Como operador, quero logs e métricas por provider e segurança de
secrets, para operar e auditar múltiplos providers com segurança.

#### Acceptance Criteria

1. Secrets NÃO DEVEM aparecer no browser nem em logs (client secret, access
   token, refresh token, authorization code, verify token, senha Garmin).
2. Secrets DEVEM ser criptografados em repouso.
3. Os logs DEVEM conter o provider e o contexto (operation, connection_id,
   status), facilitando operação multi-provider.
4. As métricas de observabilidade DEVEM ser rotuladas por provider (requests,
   errors, sync, webhooks, token refresh), sem violar políticas dos providers.
5. Rotas HTTP públicas novas (ex.: webhook Strava) DEVEM ter validação/autorização
   adequada; a ausência de autenticação DEVE ser sinalizada e justificada.

### Requisito 21 — Testes multi-provider

**User Story:** Como mantenedor, quero testes que cubram os cenários
multi-provider, para garantir que nenhuma combinação quebre.

#### Acceptance Criteria

1. O sistema DEVE ter testes do core cobrindo: usuário sem provider; só Garmin;
   só Strava; Garmin + Strava; Garmin falha e Strava funciona; Strava falha e
   Garmin funciona; desconectar um mantém o outro; provider sem sleep/recovery não
   quebra dashboard/relatório; provider sem webhook ainda sincroniza pela sua
   estratégia.
2. O sistema DEVE ter testes do módulo Strava para OAuth (state válido/inválido,
   access denied, scope parcial, refresh, refresh concorrente, refresh token
   rotacionado), webhook (challenge, create/update/delete, deauthorization,
   duplicado, atleta desconhecido, payload inválido), API (200/401/403/404/429/5xx/
   timeout/payload parcial/campo opcional ausente) e retenção (TTL, cleanup,
   delete, deauthorization).
3. As fixtures DEVEM ficar em `modules/<provider>/tests/fixtures/` e NÃO DEVEM
   conter dados reais (nome, email, telefone, GPS, tokens, IDs pessoais devem ser
   sanitizados).
4. Os testes DEVEM rodar via `npm test` (vitest) sem depender de rede externa.

### Requisito 22 — Documentação e regra de fontes oficiais

**User Story:** Como equipe, quero regras claras de integração documentadas, para
que qualquer pessoa/agente siga o padrão multi-provider.

#### Acceptance Criteria

1. O sistema DEVE adicionar ao `AGENTS.md` a seção "Integrações esportivas" com
   as regras multi-provider (nunca assumir provider conectado, usar capabilities,
   manter código específico em `modules/<provider>`, rotas como adapters, consultar
   docs oficiais, não vazar DTO remoto, preservar origem, não sobrescrever, policy
   gate, reconciliação separada).
2. O spec/documentação DEVE manter as referências oficiais do Strava e um checklist
   obrigatório antes de implementar qualquer endpoint externo.
3. Contratos externos NÃO DEVEM ser implementados com base apenas em fontes não
   oficiais (Stack Overflow, blogs, SDKs não oficiais, memória de IA); a fonte
   final DEVE ser a documentação oficial.

---

## Fora de escopo (neste ciclo)

- Implementação real dos módulos Polar, COROS, Suunto, Fitbit (apenas catálogo
  "Em breve"; sem pastas/módulos vazios).
- Habilitação de reconciliação Garmin × Strava em produção.
- Uso de dados Strava (ou Garmin) em IA/LLM.
- Preferência de fonte por métrica configurável pelo usuário (arquitetura
  permite, entrega fica para quando houver necessidade real).

## Critérios de aceite globais (Definition of Done)

**Core multi-provider:** usuário sem integração funciona; só Garmin funciona; só
Strava funciona; Garmin + Strava funciona; falha de uma integração não derruba a
outra; dashboard não exige Garmin nem Strava; relatório não exige campos
exclusivos Garmin; atividade preserva source; UI mostra origem quando necessário;
catálogo possui providers futuros como "Em breve" sem módulo implementado.

**Garmin modular:** lógica Garmin dentro de `modules/garmin`; `app/api` só
adapters; erros/parsers/DTOs/repositories/apresentação Garmin isolados; nenhum
código Strava no módulo Garmin; comportamento atual preservado.

**Strava:** `modules/strava` criado; OAuth com state e tokens criptografados;
refresh com rotação; scopes efetivos armazenados; athleteId associado; webhook
subscription + challenge + create/update/delete + deauthorization; rate limits
tratados; cache com TTL; cleanup funcionando; origem Strava exibida; Strava
funciona sem Garmin e vice-versa; Strava Data fora de IA enquanto proibido;
reconciliação Garmin × Strava permanece desabilitada.
