# Implementation Plan: Detalhe de Atividade Multi-Provider

## Overview

Este plano implementa o suporte a detalhe de atividade multi-provider: estende
a taxonomia canônica (`RyvanoSportType`) e a categorização de exibição de
métricas, adiciona o cálculo puro de zonas de FC a partir de streams, cria o
registry de enriquecimento por capability (substituindo o dispatcher
hardcoded), implementa o client/parsers do Strava para streams e laps, e
registra um novo módulo de enriquecimento Strava — sem alterar o
comportamento existente do Garmin. Execução incremental: cada tarefa é uma
etapa de código isolada e testável, construída sobre as anteriores — a
taxonomia canônica é estendida antes de qualquer código que dependa dela, o
registry de enriquecimento é criado antes de qualquer módulo Strava que se
registre nele, e o Garmin nunca é alterado. Ao final de cada fase, rodar
`npm run build` (typecheck) e `npm test` (vitest). Antes de implementar
qualquer endpoint/DTO/scope do Strava, reconfirmar a documentação oficial
vigente (já feito no design; reconfirmar apenas se o comportamento observado
do client divergir). Referências entre parênteses/itálico apontam para os
requisitos em `requirements.md` e para as properties de `design.md`.

## Tasks

### Fase 1 — Taxonomia canônica e categorização de métricas

- [x] 1. Estender a taxonomia canônica e criar `metric-display-categories`
  - Base de tudo o resto: a taxonomia `RyvanoSportType` e a categorização de
    exibição de métricas por modalidade precisam existir antes de qualquer
    código (parser Strava, dispatcher, enriquecimento) que dependa delas.

  - [x] 1.1 Estender `RyvanoSportType` com os 22 novos valores do Apêndice A
    - Em `modules/shared/activities/sport-types/index.ts`: adicionar os 22
      valores novos ao union `RyvanoSportType` e a `RYVANO_SPORT_TYPES`
      (`wheelchair`, `handcycle`, `kitesurf`, `sail`, `windsurf`,
      `pickleball`, `badminton`, `squash`, `table-tennis`, `racquetball`,
      `golf`, `cricket`, `dance`, `alpine-ski`, `backcountry-ski`,
      `nordic-ski`, `snowboard`, `snowshoe`, `ice-skate`, `inline-skate`,
      `roller-ski`, `skateboard`, `rock-climbing`).
    - Adicionar a entrada correspondente de cada novo valor em
      `RYVANO_SPORT_LABELS` (rótulos pt-BR).
    - _Requisitos: 12.4_

  - [x] 1.2 Estender `RYVANO_TO_LEGACY`, `ReportThemeSport` e os temas de relatório
    - Em `modules/shared/activities/sport-types/index.ts`: adicionar os 22
      novos valores a `RYVANO_TO_LEGACY` (fallback em `"default"` ou no
      agrupamento `SportIconName` mais próximo, ex.: `handcycle` → `bike`).
    - Em `lib/reports/types.ts`: estender o union `ReportThemeSport` com os
      mesmos 22 valores (identidade 1:1 com `RyvanoSportType`).
    - Em `modules/shared/activities/sport-types/index.ts`: estender
      `RYVANO_TO_REPORT_THEME` com os 22 novos valores (mapeamento
      identidade), garantindo que o `Record<RyvanoSportType, ReportThemeSport>`
      continue exaustivo e compile.
    - Em `lib/reports/sport-themes.ts`: adicionar uma entrada por novo valor
      ao `Record<ReportThemeSport, SportTheme>` (`themes`), reaproveitando o
      tema `default` ou um tema por categoria, garantindo que o `Record`
      continue exaustivo e compile.
    - _Requisitos: 12.4, 12.6_

  - [x] 1.3 Escrever testes de exemplo para a extensão da taxonomia
    - Testar que `isRyvanoSportType`/`getRyvanoSportLabel` reconhecem todos
      os 22 novos valores.
    - Testar que `mapRyvanoSportToLegacy`/`mapRyvanoSportToReportTheme` nunca
      lançam e retornam um valor válido para os 22 novos valores.
    - Testar que `getSportTheme` (`lib/reports/sport-themes.ts`) retorna um
      tema válido (nunca lança) para todo `ReportThemeSport` novo.
    - _Requisitos: 12.4, 12.6_

  - [x] 1.4 Criar o módulo `metric-display-categories`
    - Criar `modules/shared/activities/metric-display-categories/index.ts`
      com `MetricDisplayCategory`, `MetricDisplayRules`,
      `METRIC_DISPLAY_RULES` e `RYVANO_SPORT_TO_METRIC_CATEGORY` (tabela
      completa do Apêndice A, cobrindo TODOS os `RyvanoSportType` existentes
      + os 22 novos da Tarefa 1.1) e a função pura
      `getMetricDisplayCategory(sportType)`, com fallback em `"default"`
      para qualquer valor sem entrada.
    - Módulo puro: sem I/O, sem import de `@prisma/client` nem de módulo de
      provider.
    - _Requisitos: 12.1, 12.2, 12.3, 12.5_

  - [x] 1.5 Escrever teste de propriedade para `getMetricDisplayCategory`
    - **Property 17: Categoria de exibição de métricas é uma função pura do
      tipo de esporte canônico**
    - **Valida: Requisitos 12.1**
    - Gerar `RyvanoSportType` arbitrário (incluindo os 22 novos) e verificar
      que a função é determinística (mesma entrada → mesma saída) e nunca
      lança.

  - [x] 1.6 Escrever teste tabular exaustivo do Apêndice A
    - Um teste tabular cobrindo TODOS os `RyvanoSportType` (existentes + 22
      novos) e verificando a categoria de exibição de métricas resultante
      contra a tabela do Apêndice A do requirements.md.
    - _Requisitos: 12.2, 12.4, 12.5_

- [x] 2. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

### Fase 2 — Parser de sport type do Strava

- [x] 3. Estender `parseStravaSportType` com os novos `sport_type`

  - [x] 3.1 Adicionar as novas entradas exatas e regras de palavra-chave
    - Em `modules/strava/parsers/parse-strava-sport-type.ts`: adicionar ao
      `EXACT_SPORT_TYPES` as novas entradas (normalizadas com `_`):
      `wheelchair`, `handcycle`, `velomobile`→`bike`, `e_bike_ride`→`bike`,
      `e_mountain_bike_ride`→`mtb` (equivalências funcionais já sem valor
      dedicado), `kitesurf`, `sail`, `windsurf`, `pickleball`, `badminton`,
      `squash`, `table_tennis`→`table-tennis`, `racquetball`, `golf`,
      `cricket`, `dance`, `alpine_ski`→`alpine-ski`,
      `backcountry_ski`→`backcountry-ski`, `nordic_ski`→`nordic-ski`,
      `snowboard`, `snowshoe`, `ice_skate`→`ice-skate`,
      `inline_skate`→`inline-skate`, `roller_ski`→`roller-ski`,
      `skateboard`, `rock_climbing`→`rock-climbing`.
    - Adicionar a `KEYWORD_RULES` as regras de fallback para `kitesurf`,
      `windsurf` e `sail`, posicionadas ANTES da regra existente
      `surf: ["surf"]` (mais específico antes de mais genérico), preservando
      a ordem de avaliação documentada no arquivo.
    - _Requisitos: 12.4, 12.6_

  - [x] 3.2 Escrever teste de propriedade para `sport_type` desconhecido
    - **Property 18: `sport_type` desconhecido de qualquer provider cai
      sempre na categoria padrão, sem erro**
    - **Valida: Requisitos 12.3**
    - Gerar strings arbitrárias (filtrando, via gerador, os valores
      conhecidos de `EXACT_SPORT_TYPES` e as palavras-chave de
      `KEYWORD_RULES`) e verificar que `parseStravaSportType` retorna sempre
      `"default"`, e que `getMetricDisplayCategory("default")` retorna a
      categoria de fallback, sem lançar exceção em nenhum caso.

  - [x] 3.3 Escrever testes de exemplo para os novos `sport_type` exatos
    - Testar cada novo valor de `EXACT_SPORT_TYPES` individualmente.
    - Testar que `"Kitesurf"`/`"Windsurf"`/`"Sail"` não caem incorretamente
      na regra genérica `surf` (precedência de `KEYWORD_RULES`).
    - Testar as equivalências funcionais sem valor dedicado (`Velomobile` →
      `bike`, `EBikeRide` → `bike`, `EMountainBikeRide` → `mtb`).
    - _Requisitos: 12.4, 12.6_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

### Fase 3 — Cálculo de zonas de FC (compartilhado, puro)

- [x] 5. Implementar o módulo `heart-rate-zones`

  - [x] 5.1 Implementar `computeHeartRateZonesFromStream`
    - Criar `modules/shared/activities/heart-rate-zones/compute-heart-rate-zones-from-stream.ts`
      com `HeartRateSample`, `HEART_RATE_ZONE_PERCENT_BOUNDARIES`,
      `HEART_RATE_ZONE_LABELS` e a função pura
      `computeHeartRateZonesFromStream(samples, maxHeartRateReference)`, que
      integra o tempo entre amostras consecutivas na zona da amostra
      anterior e retorna um `ActivityBarSection` de 5 itens, ou `null` para
      série vazia ou FC máxima de referência não positiva.
    - _Requisitos: 2.3, 2.6, 2.7, 10.3_

  - [x] 5.2 Escrever teste de propriedade para `computeHeartRateZonesFromStream`
    - **Property 4: Cálculo de zonas por stream produz exatamente 5 faixas
      cobrindo o tempo total, e omissão sem dado suficiente**
    - **Property 15: Cálculo de zonas de FC é puro e determinístico**
    - **Valida: Requisitos 2.3, 2.6, 10.3**
    - Gerar séries de FC arbitrárias (tamanho e valores, incluindo vazias) e
      FC máxima de referência arbitrária (incluindo zero/negativa);
      verificar 5 itens, soma dos tempos igual ao intervalo total, `null`
      nos casos degenerados, e que chamar duas vezes com os mesmos
      argumentos produz resultados estruturalmente idênticos (sem I/O).

  - [x] 5.3 Implementar `resolveMaxHeartRateReference`
    - Criar `modules/shared/activities/heart-rate-zones/resolve-max-heart-rate-reference.ts`
      com `MaxHeartRateReferenceInput` e a função pura
      `resolveMaxHeartRateReference(input)`, seguindo a ordem de precedência
      do Requisito 2.4: (a) `maxHeartRate` da atividade quando maior que
      `averageHeartRate`; (b) estimativa por idade (`208 - 0.7 * idade`)
      quando `ageYears` presente; (c) `null`.
    - _Requisitos: 2.4_

  - [x] 5.4 Escrever teste de propriedade para `resolveMaxHeartRateReference`
    - **Property 5: Ordem de precedência da FC máxima de referência é
      respeitada**
    - **Valida: Requisitos 2.4**
    - Gerar combinações arbitrárias de `maxHeartRate`/`averageHeartRate`/
      `ageYears` (presentes/ausentes) e verificar a ordem de precedência
      exata, sem exceção em nenhum caso.

  - [x] 5.5 Criar o barrel `modules/shared/activities/heart-rate-zones/index.ts`
    - Reexportar `computeHeartRateZonesFromStream`,
      `resolveMaxHeartRateReference` e os tipos associados.
    - _Requisitos: 2.7_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

### Fase 4 — Catálogo: capability de zonas de FC do Strava

- [x] 7. Declarar `heartRateZones: true` para o Strava no catálogo

  - [x] 7.1 Adicionar a capability ao catálogo
    - Em `modules/shared/integrations/catalog/index.ts`: adicionar
      `heartRateZones: true` às capabilities de `STRAVA`, com um comentário
      referenciando a decisão de cálculo por stream (Requisito 8.1). NÃO
      declarar `powerZones: true` (permanece ausente/`false`, fora de
      escopo).
    - _Requisitos: 8.1, 8.3_

  - [x] 7.2 Escrever teste de exemplo do catálogo
    - Testar que `hasCapability("STRAVA", "heartRateZones")` retorna `true`
      e que `hasCapability("STRAVA", "powerZones")` retorna
      `false`/`undefined`.
    - _Requisitos: 8.1, 8.3_

---

### Fase 5 — Extensão de `ActivityBarSection` (aviso de aproximação)

- [x] 8. Adicionar `approximate?`/`disclaimer?` a `ActivityBarSection`

  - [x] 8.1 Estender o tipo de apresentação
    - Em `modules/shared/activities/presentation/activity-visual-data.ts`:
      adicionar os campos opcionais `approximate?: boolean` e
      `disclaimer?: string` ao tipo `ActivityBarSection`.
    - Confirmar que `modules/garmin/presentation/view-models/activity-visual-data.ts`
      (que reexporta o mesmo tipo) recebe os campos automaticamente sem
      edição própria, e que `getGarminActivityVisualData` continua
      funcionando sem preencher esses campos (comportamento Garmin
      inalterado).
    - _Requisitos: 2.5_

  - [x] 8.2 Escrever teste de tipo/exemplo para a extensão
    - Testar que uma `ActivityBarSection` sem `approximate`/`disclaimer`
      continua válida (compatibilidade retroativa) e que uma com
      `approximate: true` + `disclaimer` também é aceita pelo tipo.
    - _Requisitos: 2.5_

---

### Fase 6 — Registry de enriquecimento e reescrita do dispatcher

- [x] 9. Criar o registry de enriquecimento de detalhe

  - [x] 9.1 Implementar `activity-detail-enrichment-registry.ts`
    - Criar `modules/shared/activities/presentation/activity-detail-enrichment-registry.ts`
      com `ActivityDetailEnricher`, `ActivityDetailEnricherLoader`,
      `ACTIVITY_DETAIL_ENRICHER_LOADERS` (`GARMIN` e `STRAVA` via dynamic
      import) e `getActivityDetailEnricherLoader(providerId)`.
    - Módulo não importa estaticamente `modules/garmin`/`modules/strava` (só
      via `import()` dentro dos loaders), preservando o desacoplamento já
      existente.
    - _Requisitos: 1.1, 1.2, 1.4, 7.1, 7.2_

  - [x] 9.2 Escrever teste de propriedade para resolução por registry
    - **Property 1: Enriquecimento é resolvido por capability e registry,
      não por identidade do provider**
    - **Property 11: Qualquer provider satisfazendo as capabilities
      relevantes funciona sem alteração do core**
    - **Valida: Requisitos 1.1, 1.2, 7.2**
    - Usando um `ProviderId` sintético registrado apenas em teste (via
      injeção de um registry de teste ou mock do módulo), verificar que
      `getActivityDetailEnricherLoader` resolve o loader correto
      independentemente de qual `ProviderId` específico seja, e que
      providers sem capability/sem entrada retornam `undefined`.

- [x] 10. Reescrever o dispatcher para usar o registry e a categorização

  - [x] 10.1 Substituir o `if` hardcoded pelo lookup no registry
    - Em `modules/shared/activities/presentation/get-activity-visual-data.ts`:
      remover `enrichGarminActivityVisualData` (o
      `if (providerId === "GARMIN" && hasCapability(...))` hardcoded) e
      substituir por `getActivityDetailEnricherLoader(providerId)` + uma
      função `tryEnrich` genérica que nunca lança (captura qualquer exceção
      e retorna `null`).
    - Manter a assinatura pública de `getActivityVisualData` e
      `buildBaseActivityVisualData` inalterada.
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 7.3, 7.4_

  - [x] 10.2 Substituir `isSwimSport`/`isRunSport` por `getMetricDisplayCategory`
    - No mesmo arquivo: remover as heurísticas de substring
      `isSwimSport`/`isRunSport` e passar a consultar
      `METRIC_DISPLAY_RULES[getMetricDisplayCategory(sportType)]` em
      `buildBaseHeroStats`/`buildBaseOverviewMetrics` para decidir rótulo de
      cadência (`cadence` vs. `stroke-rate`), formato de ritmo
      (`pace-per-km`/`pace-per-100m`/fallback de velocidade) e se a métrica
      deve ou não ser exibida (`cadenceOrStrokeRate`/`pace === false`).
    - Confirmar que `modules/garmin/application/activities/garmin-activity-details.ts`
      NÃO é alterado por esta tarefa (mantém seu próprio
      `sportKey.includes(...)` interno, fora de escopo desta spec).
    - _Requisitos: 4.1, 4.2, 4.5, 4.6, 5.1, 5.2, 5.5, 5.6, 7.1_

  - [x] 10.3 Escrever teste de propriedade para ausência de enriquecedor
    - **Property 2: Ausência de enriquecedor cai sempre na visão base, nunca
      em erro ou vazio**
    - **Property 12: `getActivityVisualData` nunca lança e sempre retorna
      uma visão válida, para qualquer combinação de dados opcionais
      ausentes**
    - **Valida: Requisitos 1.3, 7.3**
    - Gerar atividades cujo provider não tenha capability `activityDetails`
      OU não tenha entrada no registry, e verificar que o resultado é
      exatamente `buildBaseActivityVisualData(activity)`, sem exceção.
      Gerar também combinações arbitrárias de dados opcionais ausentes e
      verificar que `heroStats`/`overviewMetrics` nunca ficam vazios e a
      função nunca lança.

  - [x] 10.4 Escrever teste de propriedade para rotulagem por categoria
    - **Property 7: Rotulagem de cadência/frequência de braçadas e formato
      de ritmo dependem só da categoria de exibição de métricas**
    - **Property 8: Categorias sem cadência/ritmo nunca exibem essas
      métricas mesmo com dado bruto presente**
    - **Valida: Requisitos 4.1, 4.2, 4.5, 4.6, 5.1, 5.2, 5.5, 5.6**
    - Gerar `RyvanoSportType` arbitrário + valores numéricos arbitrários de
      cadência/pace/velocidade e verificar que o rótulo/presença da métrica
      em `buildBaseOverviewMetrics` respeita exatamente
      `METRIC_DISPLAY_RULES[getMetricDisplayCategory(sportType)]`, e que
      duas atividades com o mesmo `sportType` e providers diferentes
      produzem o mesmo resultado.

  - [x] 10.5 Escrever teste de propriedade para métricas agregadas de FC
    - **Property 6: Métricas agregadas de FC aparecem se e somente se os
      dados normalizados existem**
    - **Valida: Requisitos 3.1, 3.3**
    - Gerar atividades com `averageHeartRate`/`maxHeartRate`
      presentes/ausentes de forma independente e verificar presença
      condicional das linhas "FC média"/"FC máxima" em `overviewMetrics`,
      sem exceção.

  - [x] 10.6 Reexecutar e adaptar os testes de não-regressão Garmin
    - Reexecutar (e adaptar, se necessário) os testes existentes envolvendo
      `getGarminActivityVisualData`/`getActivityVisualData` para atividades
      Garmin (ex.: `tests/view-models-multi-provider.test.ts`), garantindo
      que a saída para atividades Garmin permanece idêntica à anterior à
      reescrita do dispatcher (Tarefas 9 e 10).
    - _Requisitos: 1.5_

- [x] 11. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

### Fase 7 — Client Strava: streams e laps

- [x] 12. Implementar os novos métodos do `StravaClient`

  - [x] 12.1 Implementar `StravaClient.getActivityStreams`
    - Em `modules/strava/api/client/strava-client.ts`: adicionar
      `GetActivityStreamsParams` (`keys: readonly string[]`) e o método
      `getActivityStreams(ctx, id, params)`, chamando
      `GET /activities/{id}/streams?keys=...&key_by_type=true` (sempre
      fixando `key_by_type=true`) via o `request()` privado já existente,
      validando com `stravaStreamSetObjectSchema` (reaproveitado de
      `api/schemas/strava-stream.ts`, sem schema novo).
    - Reaproveitar o mesmo tratamento de retry em 401, backoff em 429,
      parsing de `Fault`, timeout e logging já existente em
      `listAthleteActivities`/`getActivityById` (Requisito 9.5).
    - _Requisitos: 9.1, 9.5, 10.2_

  - [x] 12.2 Implementar `StravaClient.getActivityLaps`
    - No mesmo arquivo: adicionar o método `getActivityLaps(ctx, id)`,
      chamando `GET /activities/{id}/laps` via o `request()` privado,
      validando com `stravaLapListSchema` (reaproveitado de
      `api/schemas/strava-lap.ts`, sem schema novo).
    - _Requisitos: 9.2, 9.5, 10.2_

  - [x] 12.3 Escrever testes de exemplo para os novos métodos do client
    - Espelhar os testes já existentes de `strava-client.test.ts` (sucesso
      200, 401 com retry, 429 com `retryAfterMs`, payload inválido/schema
      falha, 403, 404, 5xx, timeout) para `getActivityStreams` e
      `getActivityLaps`, reutilizando o padrão de mock de `fetch`/auth já
      usado no arquivo.
    - Criar fixtures novas sanitizadas em
      `modules/strava/tests/fixtures/activity-streams.ts` e
      `modules/strava/tests/fixtures/activity-laps.ts` (sem dados reais de
      usuários), seguindo o padrão de `strava-activities.ts`.
    - _Requisitos: 9.1, 9.2, 9.4, 9.5_

- [x] 13. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

### Fase 8 — Parsers de streams e laps do Strava

- [x] 14. Implementar os parsers de streams e laps

  - [x] 14.1 Implementar `parseStravaStreams` e `toHeartRateSamples`
    - Criar `modules/strava/parsers/parse-strava-streams.ts` com
      `ParsedActivityStream` e `parseStravaStreams(dto: StravaStreamSetObjectDto)`,
      convertendo cada chave presente no DTO validado em uma entrada interna
      (uma por tipo, nenhuma obrigatória).
    - Implementar `toHeartRateSamples(streams)`, pareando o stream
      `heartrate` com o stream `time` da mesma resposta (mesmo índice =
      mesmo instante); quando `time` não vier na resposta, gerar amostragem
      uniforme sintética a partir do índice (defensivo), retornando `null`
      quando não houver stream de FC.
    - _Requisitos: 9.3_

  - [x] 14.2 Escrever teste de propriedade para `parseStravaStreams`
    - **Property 14: Parsers de stream/lap produzem estrutura interna bem
      formada para qualquer DTO válido**
    - **Valida: Requisitos 9.3**
    - Gerar `StravaStreamSetObjectDto` arbitrários válidos (incluindo casos
      com chaves opcionais ausentes) e verificar que `parseStravaStreams`
      nunca lança e preserva os tipos/índices presentes no DTO de entrada.

  - [x] 14.3 Implementar `parseStravaLaps`
    - Criar `modules/strava/parsers/parse-strava-laps.ts` com
      `ParsedActivityLap` e `parseStravaLaps(dtos: StravaLapDto[])`,
      convertendo cada `StravaLapDto` em um lap interno (campos
      `number | null`), ordenado por `lap_index`/`split`.
    - _Requisitos: 9.3_

  - [x] 14.4 Escrever teste de propriedade para `parseStravaLaps`
    - **Property 14: Parsers de stream/lap produzem estrutura interna bem
      formada para qualquer DTO válido**
    - **Valida: Requisitos 9.3**
    - Gerar `StravaLapDto[]` arbitrários válidos (incluindo campos opcionais
      ausentes) e verificar que `parseStravaLaps` nunca lança e preserva os
      campos presentes.

  - [x] 14.5 Atualizar o barrel `modules/strava/parsers/index.ts`
    - Reexportar `parseStravaStreams`, `toHeartRateSamples`,
      `parseStravaLaps` e os tipos associados.
    - _Requisitos: 9.3_

- [x] 15. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

### Fase 9 — Enriquecimento Strava (novo módulo)

- [x] 16. Implementar o esqueleto de `getStravaActivityVisualData` (cache + busca tolerante)

  - [x] 16.1 Implementar cache e busca paralela tolerante a falha
    - Criar `modules/strava/application/activities/strava-activity-details.ts`
      com `STRAVA_ACTIVITY_VISUAL_CACHE_TTL_MS` (5 min, mesmo TTL do
      Garmin), `stravaActivityVisualCache` (Map por
      `activity.id:updatedAt`), e `getStravaActivityVisualData(activity)`,
      que: 1. consulta o cache em memória; 2. busca em paralelo
      (`Promise.all`, tolerante a falha individual via um `loadOptional`
      local, mesmo padrão do Garmin) `client.getActivityStreams` e
      `client.getActivityLaps`; 3. captura qualquer erro
      (401/403/404/429/5xx/timeout/payload inválido) tratando como ausência
      de dado (nunca propaga).
    - Assinatura compatível com `ActivityDetailEnricher` do registry.
    - Envolver a busca de streams/laps para enriquecimento com uma chamada a
      `logIntegrationEvent` (`provider: "STRAVA"`, `operation` identificando
      a busca de streams/laps para detalhe, `status`), seguindo o mesmo
      padrão de observabilidade já estabelecido para integrações
      (Requisito 10.2).
    - _Requisitos: 9.4, 10.1, 10.2, 10.4_

  - [x] 16.2 Escrever teste de propriedade para falhas de streams/laps
    - **Property 13: Falhas de rede/validação em streams ou laps do Strava
      nunca propagam para o enriquecimento**
    - **Valida: Requisitos 9.4**
    - Com `StravaClient` mockado, gerar combinações arbitrárias de qual
      chamada (streams/laps) falha e com qual tipo de erro
      (401/403/404/429/5xx/timeout/payload inválido), verificando que
      `getStravaActivityVisualData` trata a falha como ausência do dado
      correspondente e retorna normalmente, nunca lançando.

  - [x] 16.3 Escrever teste de propriedade para o cache em memória
    - **Property 16: Cache de enriquecimento evita buscas repetidas para a
      mesma atividade**
    - **Valida: Requisitos 10.4**
    - Chamar `getStravaActivityVisualData` múltiplas vezes para a mesma
      atividade (mesmo `id`/`updatedAt`) dentro do TTL e verificar que o
      mock do client subjacente é chamado exatamente uma vez,
      independentemente de quantas vezes a função for chamada.

- [x] 17. Compor zonas de FC calculadas, splits e análise do treino

  - [x] 17.1 Compor zonas de FC calculadas
    - No mesmo arquivo (`strava-activity-details.ts`): após obter os
      streams parseados, resolver
      `maxHrRef = resolveMaxHeartRateReference(activity)` e, quando o
      stream de FC estiver presente, `maxHrRef` não for `null` e
      `METRIC_DISPLAY_RULES[getMetricDisplayCategory(activity.sportType)].heartRateZones`
      for `true`, chamar `computeHeartRateZonesFromStream(hrSamples, maxHrRef)`
      e incluir o resultado em `barSections` com `approximate: true` e um
      `disclaimer` (ex.: "Zonas estimadas por %FC máx. — podem diferir das
      configuradas no Strava.").
    - _Requisitos: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 17.2 Escrever teste de propriedade para prioridade nativa vs. calculada
    - **Property 3: Zonas de FC nativas têm prioridade sobre zonas
      calculadas**
    - **Valida: Requisitos 2.2**
    - Usando um provider sintético de teste que pode oferecer tanto zona
      nativa quanto stream de FC, verificar que quando ambas as fontes
      estão presentes, o resultado final é o dado nativo, sem
      `approximate: true`. (Nota: o Strava real desta spec só oferece a
      fonte calculada; este teste valida a regra de prioridade no nível do
      core/composição, não uma capability real do Strava.)

  - [x] 17.3 Compor splits/laps e seção de análise do treino
    - No mesmo arquivo: incluir uma seção `barSections` de splits a partir
      de `parseStravaLaps` quando presentes (capability `laps`), e montar
      `metricSections` com o resumo/leitura interpretativa do treino (tempo
      em zonas, variação de pace/cadência entre laps), usando
      `getMetricDisplayCategory` para decidir quais sub-blocos oferecer
      (ritmo/pace, cadência/frequência de braçadas, velocidade), conforme
      `MetricDisplayRules.workoutAnalysis`.
    - Compor a lista final de `barSections`/`metricSections` apenas com os
      sub-blocos cujos dados de origem existirem (sem sub-blocos vazios).
    - _Requisitos: 4.3, 4.4, 4.6, 5.4, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 17.4 Escrever teste de propriedade para composição da análise do treino
    - **Property 10: A seção de análise do treino reflete exatamente as
      fontes de dado disponíveis**
    - **Valida: Requisitos 6.1, 6.2, 6.3, 6.4**
    - Gerar as 8 combinações possíveis de disponibilidade das 3 fontes
      (zonas de FC, laps/splits, streams) e verificar que a seção de
      análise do treino está presente se e somente se ao menos uma fonte
      estiver disponível, e contém exatamente os sub-blocos correspondentes.

  - [x] 17.5 Escrever teste de propriedade para omissão graciosa de dado específico de modalidade
    - **Property 9: Ausência de dado específico de modalidade é omissão
      graciosa, nunca erro/zero/mensagem de indisponibilidade**
    - **Valida: Requisitos 4.4**
    - Gerar uma atividade de natação sem stream de frequência de braçadas
      (e, de forma geral, qualquer combinação sem um dado opcional
      específico da categoria) e verificar que a métrica/seção
      correspondente é omitida sem exceção, sem valor `0`/`"—"` enganoso e
      sem mensagem de "recurso indisponível".

  - [x] 17.6 Criar o barrel `modules/strava/application/activities/index.ts`
    - Reexportar `getStravaActivityVisualData` e os tipos associados.
    - _Requisitos: 1.2_

- [x] 18. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

### Fase 10 — Ligação final: registrar Strava no registry e no módulo público

- [x] 19. Ligar o módulo Strava ao registry de enriquecimento

  - [x] 19.1 Confirmar a entrada `STRAVA` no registry e a exportação pública
    - Em `modules/shared/activities/presentation/activity-detail-enrichment-registry.ts`
      (criado na Tarefa 9.1): confirmar/ajustar a entrada
      `STRAVA: async () => (await import("@/modules/strava")).getStravaActivityVisualData`
      para apontar ao módulo real implementado na Fase 9.
    - Em `modules/strava/index.ts`: exportar `getStravaActivityVisualData` a
      partir de `modules/strava/application/activities`.
    - _Requisitos: 1.2, 1.4_

  - [x] 19.2 Escrever teste de integração end-to-end do dispatcher com Strava real
    - Testar `getActivityVisualData` para uma atividade Strava com
      `StravaClient`/streams/laps mockados, verificando que o resultado
      final inclui zonas de FC calculadas (`approximate: true`), splits
      (quando presentes) e seção de análise do treino — sem nenhuma
      comparação direta a `"STRAVA"` no código do core
      (`modules/shared/activities/presentation/**`).
    - _Requisitos: 1.1, 1.2, 7.1_

- [x] 20. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

### Fase 11 — UI: import path e badge de aproximação

- [x] 21. Atualizar `activity-visual-dashboard.tsx`

  - [x] 21.1 Corrigir o import path
    - Em `components/activities/activity-visual-dashboard.tsx`: trocar o
      import de `ActivityBarSection`/`ActivityHeroStat`/`ActivityMetricRow`/
      `ActivityMetricSection` de `@/modules/garmin/presentation/view-models`
      para `@/modules/shared/activities/presentation/activity-visual-data`.
    - _Requisitos: 7.1_

  - [x] 21.2 Renderizar o aviso de aproximação (`approximate`/`disclaimer`)
    - No mesmo arquivo (`AnimatedBarList`/`MetricHeader`): quando
      `section.approximate` for `true`, exibir `section.disclaimer` como
      uma nota pequena abaixo da `subtitle` existente (mesmo padrão visual
      de `text-foreground/58` já usado para `description`), sem introduzir
      componente novo.
    - Não alterar o comportamento de arrastar/reordenar/redimensionar de
      `CustomizableCardGrid`.
    - _Requisitos: 2.5, 11.4_

  - [x] 21.3 Escrever teste de exemplo para o import path e o badge
    - Teste de tipo/compilação garantindo que o novo import é
      estruturalmente compatível com o consumo existente do componente.
    - Teste de exemplo (React Testing Library) renderizando uma seção com
      `approximate: true` + `disclaimer` e verificando que o texto do aviso
      aparece; e uma seção sem esses campos, verificando que nenhum aviso
      aparece (não-regressão visual do Garmin).
    - _Requisitos: 2.5_

- [x] 22. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

### Fase 12 — Animação e verificação final

- [x] 23. Confirmar animação e rodar não-regressão completa

  - [x] 23.1 Confirmar tratamento de `useReducedMotion` nas novas seções
    - Em `components/activities/activity-visual-dashboard.tsx`: confirmar
      que as novas seções (zonas calculadas, análise do treino) reutilizam
      o mesmo tratamento de `useReducedMotion` já aplicado às seções
      existentes (nenhum código novo de animação fora do padrão
      `AnimatedBarList`/`itemVariants` já usado).
    - _Requisitos: 11.1, 11.2, 11.3, 11.4_

  - [x] 23.2 Escrever testes de exemplo de animação e não-regressão de drag/resize
    - Testar `activity-visual-dashboard.tsx` com `useReducedMotion` mockado
      como `true`, verificando que as novas seções (zonas calculadas,
      análise do treino) não recebem as variantes de animação contínua.
    - Testar que `CustomizableCardGrid` recebe os mesmos itens de
      drag/resize independentemente das novas seções (não-regressão).
    - _Requisitos: 11.1, 11.2, 11.3, 11.4_

  - [x] 23.3 Não-regressão completa e verificação final
    - Rodar `npm run build` (typecheck do Next, incluindo os tipos
      exaustivos de `RyvanoSportType`/`ReportThemeSport`) e `npm test`
      (vitest) com a suíte completa.
    - Confirmar, via busca no código (`grep`/leitura do diff), que nenhum
      arquivo em `modules/shared/**` compara o identificador do provider
      (`provider === "STRAVA"`/`"GARMIN"`) para decidir enriquecimento,
      zonas, cadência, ritmo ou análise do treino (Requisito 7.1).
    - Confirmar que `garmin-activity-details.ts` e seus testes permanecem
      sem alteração de comportamento observável.
    - _Requisitos: 1.5, 7.1, 7.2, 7.3, 7.4_

- [x] 24. Checkpoint final — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tarefas marcadas com `*` são testes (unitários, de propriedade ou de
  exemplo/integração) e são opcionais — podem ser puladas para um MVP mais
  rápido, mas cobrem diretamente as Correctness Properties do design.md.
- `fast-check` já está disponível como dependência transitiva no
  `package-lock.json` deste projeto (via outra dependência de dev); as
  tarefas de teste de propriedade devem importar `fast-check` diretamente. Se
  o import falhar por não estar declarado como dependência direta, adicionar
  `fast-check` a `devDependencies` do `package.json` (versão fixada, ex.:
  `"fast-check": "3.23.2"`) antes de escrever o primeiro teste de propriedade.
- Cada teste de propriedade deve referenciar sua propriedade do design via
  comentário no formato **Feature: detalhe-atividade-multi-provider,
  Property {number}: {texto resumido da propriedade}**, conforme a Testing
  Strategy do design.md. Mínimo de 100 iterações por teste de propriedade.
- O módulo Garmin (`modules/garmin/**`) não é alterado por nenhuma tarefa
  deste plano, exceto pela reexportação automática dos novos campos opcionais
  de `ActivityBarSection` (Tarefa 8.1), que não exige edição de arquivo
  Garmin.
- A ordem das fases preserva a dependência: taxonomia (Fase 1) → parser
  Strava (Fase 2) → cálculo de zonas puro (Fase 3) → catálogo (Fase 4) → tipo
  de apresentação (Fase 5) → registry + dispatcher (Fase 6) → client Strava
  (Fase 7) → parsers de streams/laps (Fase 8) → enriquecimento Strava
  (Fase 9) → ligação final no registry (Fase 10) → UI (Fase 11) → animação/
  verificação final (Fase 12).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "5.1", "5.3", "7.1", "8.1", "9.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "3.1", "5.2", "5.4", "7.2", "8.2", "9.2", "10.1"] },
    { "id": 2, "tasks": ["1.3", "1.5", "1.6", "5.5", "10.2", "12.1", "12.2"] },
    { "id": 3, "tasks": ["3.2", "3.3", "10.3", "10.5", "10.6", "12.3", "14.1", "14.3"] },
    { "id": 4, "tasks": ["10.4", "14.2", "14.4", "14.5"] },
    { "id": 5, "tasks": ["16.1"] },
    { "id": 6, "tasks": ["16.2", "16.3", "17.1"] },
    { "id": 7, "tasks": ["17.2", "17.3"] },
    { "id": 8, "tasks": ["17.4", "17.5", "17.6"] },
    { "id": 9, "tasks": ["19.1"] },
    { "id": 10, "tasks": ["19.2", "21.1"] },
    { "id": 11, "tasks": ["21.2"] },
    { "id": 12, "tasks": ["21.3", "23.1"] },
    { "id": 13, "tasks": ["23.2"] },
    { "id": 14, "tasks": ["23.3"] }
  ]
}
```
