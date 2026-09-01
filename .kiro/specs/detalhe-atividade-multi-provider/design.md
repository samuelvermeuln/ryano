# Design Document

## Overview

Hoje, `getActivityVisualData` (`modules/shared/activities/presentation/get-activity-visual-data.ts`)
monta a visão base provider-agnostic e depois faz uma checagem hardcoded —
`providerId === "GARMIN" && hasCapability(providerId, "activityDetails")` —
para decidir se chama o único enriquecedor conhecido
(`enrichGarminActivityVisualData`). Isso funciona para Garmin, mas deixa
qualquer outro provider (Strava hoje; Polar/COROS/Suunto/Fitbit no futuro) preso
na visão mínima: sem zonas de FC, sem seção de análise do treino, com
cadência/ritmo rotulados por heurística de substring (`isSwimSport`/`isRunSport`)
em vez de uma categorização real por modalidade.

Este design substitui esse `if` único por um **registry de enriquecimento**
(`ProviderId -> enricher`), resolvido por capability, e adiciona um módulo de
enriquecimento Strava (`getStravaActivityVisualData`) que segue o mesmo
contrato estrutural do enriquecedor Garmin existente (`ActivityVisualData`),
mas obtém zonas de FC por **cálculo interno a partir do stream de FC** — a
decisão arquitetural já confirmada no requirements.md, que evita o scope OAuth
`profile:read_all` e o endpoint pago de zonas por atividade.

Três peças novas do core sustentam isso, todas puras e provider-agnostic:

1. **Registry de enriquecimento** (`activity-detail-enrichment-registry.ts`):
   mapeia `ProviderId -> () => Promise<enricher>`, cada entrada carregada por
   dynamic import (preservando o desacoplamento estático já existente entre
   `shared` e os módulos de provider). Adicionar Strava é registrar uma entrada,
   não editar a entrada do Garmin.
2. **Categoria de exibição de métricas** (`metric-display-categories/`): resolve,
   a partir do `RyvanoSportType` (nunca do provider), quais seções fazem sentido
   para uma atividade — zonas de FC, cadência/frequência de braçadas, ritmo/pace,
   tipo de análise do treino. Substitui a heurística `isSwimSport`/`isRunSport`
   por substring.
3. **Cálculo de zonas de FC por stream** (`heart-rate-zones/`): função pura que
   recebe uma série de FC e uma FC máxima de referência, e devolve 5 faixas por
   `%FCmáx` no formato `ActivityBarSection`. Não pertence a nenhum provider —
   qualquer provider futuro com capability `streams` e stream de FC pode
   reutilizá-la (Requisito 2.7).

O Garmin não é alterado: `getGarminActivityVisualData` continua a mesma função,
apenas passa a ser descoberta via registry em vez de citada por nome no core.

## Architecture

### Fluxo de `getActivityVisualData` (antes → depois)

```text
ANTES (hoje)
────────────
getActivityVisualData(activity)
  → base = buildBaseActivityVisualData(activity)
  → SE providerId === "GARMIN" E hasCapability(providerId, "activityDetails")
      → enriched = enrichGarminActivityVisualData(activity)   // único caminho hardcoded
      → SE enriched: retorna enriched
  → retorna base


DEPOIS (este design)
─────────────────────
getActivityVisualData(activity)
  → base = buildBaseActivityVisualData(activity)     // já usa getMetricDisplayCategory
  → SE hasCapability(providerId, "activityDetails")
      → enricher = resolveActivityDetailEnricher(providerId)   // registry, não if
      → SE enricher existe:
          → enriched = tryEnrich(enricher, activity)           // nunca lança
          → SE enriched: retorna enriched
  → retorna base
```

O dispatcher deixa de saber que "Garmin" ou "Strava" existem: ele só sabe que
existe um `ActivityDetailEnrichmentRegistry` indexado por `ProviderId`. Registrar
Strava não altera a entrada do Garmin nem o dispatcher (Requisito 1.4).

### Registry de enriquecimento

```text
activity-detail-enrichment-registry.ts
┌─────────────────────────────────────────────────────────────┐
│ ACTIVITY_DETAIL_ENRICHERS: Record<ProviderId, () => Promise<│
│   ((activity: Activity) => Promise<ActivityVisualData|null>)>│
│                                                               │
│   GARMIN: () => import("@/modules/garmin")                  │
│               .then(m => m.getGarminActivityVisualData)     │
│   STRAVA: () => import("@/modules/strava")                  │
│               .then(m => m.getStravaActivityVisualData)     │
│   // POLAR/COROS/SUUNTO/FITBIT: ausentes até serem implemen- │
│   // tados — resolveActivityDetailEnricher retorna undefined │
└─────────────────────────────────────────────────────────────┘
```

Cada entrada é uma fábrica (`() => Promise<enricherFn>`), não a função em si,
para preservar o dynamic import (evita que `modules/shared` importe
estaticamente `modules/garmin`/`modules/strava`, o que criaria o ciclo
`shared -> garmin -> shared` que o comentário do código atual já evita). O
registry em si é um objeto estático simples (`Record`), então adicionar um
provider futuro é uma linha nova, não uma mudança estrutural.

### Sequência de renderização da página de detalhe

```text
app/app/atividades/[id]/page.tsx
  │
  ▼
getActivityVisualData(activity)
  │
  ├─► buildBaseActivityVisualData(activity)
  │     └─► getMetricDisplayCategory(activity.sportType)  // decide o que é elegível
  │
  ├─► hasCapability(activity.provider, "activityDetails") ?
  │     não → retorna base
  │     sim ▼
  │
  ├─► resolveActivityDetailEnricher(activity.provider)   // lookup no registry
  │     ausente → retorna base
  │     presente ▼
  │
  ├─► enricher(activity)   // dynamic import + chamada, com try/catch
  │     lança OU retorna null → retorna base (omissão graciosa, Requisito 7.3)
  │     retorna dado ▼
  │
  └─► retorna ActivityVisualData enriquecida
        │
        ▼
  ActivityVisualDashboard (client component)
    - CustomizableCardGrid monta cards a partir de overviewMetrics/
      barSections/metricSections — já agnóstico, sem mudança estrutural
```

### Enriquecimento Strava (novo módulo)

```text
modules/strava/application/activities/strava-activity-details.ts
┌───────────────────────────────────────────────────────────────────┐
│ getStravaActivityVisualData(activity)                            │
│   1. cache em memória por activity.id + updatedAt (TTL curto),   │
│      mesmo padrão de garminActivityVisualCache                   │
│   2. busca em paralelo (Promise.all, tolerante a falha individual):│
│        streams = client.getActivityStreams(id, KEYS)             │
│        laps    = client.getActivityLaps(id)                      │
│   3. parseStravaStreams(streams) / parseStravaLaps(laps)         │
│      → estruturas internas (nunca o DTO cru)                     │
│   4. categoria = getMetricDisplayCategory(activity.sportType)    │
│   5. zonas FC:                                                   │
│        maxHrRef = resolveMaxHeartRateReference(activity, profile)│
│        SE stream de FC presente E maxHrRef presente E categoria  │
│           permite zonas:                                         │
│           computeHeartRateZonesFromStream(hrStream, maxHrRef)    │
│           → ActivityBarSection (com approximate: true)           │
│   6. barSections = [zonas?, splits (a partir de laps)?].filter   │
│   7. metricSections = [análise do treino: pace/cadência/FC ao    │
│      longo do treino, resolvidos pela categoria]                 │
│   8. retorna ActivityVisualData (ou null se nada disponível e a  │
│      visão base já é suficiente)                                 │
└───────────────────────────────────────────────────────────────────┘
```

Este módulo é estruturalmente paralelo a
`modules/garmin/application/activities/garmin-activity-details.ts`: mesma
forma de retorno, mesmo padrão de cache em memória com TTL, mesmo padrão de
"carregar tolerante a falha individual" (`loadOptional`), mas usando
`StravaClient` + cálculo local em vez dos endpoints nativos do Garmin.

### Novo módulo `metric-display-categories`

```text
modules/shared/activities/metric-display-categories/index.ts
┌────────────────────────────────────────────────────────────────┐
│ MetricDisplayCategory = "endurance-pace" | "cycling" | "swim"  │
│   | "paddle" | "wind-sail" | "strength-studio" | "team-racket" │
│   | "snow-ice-adventure" | "multisport" | "default"            │
│                                                                  │
│ RYVANO_SPORT_TO_METRIC_CATEGORY: Record<RyvanoSportType,        │
│   MetricDisplayCategory>   // tabela do Apêndice A              │
│                                                                  │
│ getMetricDisplayCategory(sportType): MetricDisplayCategory      │
│   → lookup na tabela, fallback "default" para qualquer valor    │
│     desconhecido (nunca lança)                                  │
│                                                                  │
│ METRIC_CATEGORY_RULES: Record<MetricDisplayCategory, {          │
│   heartRateZones: boolean;                                      │
│   cadenceOrStrokeRate: "cadence" | "stroke-rate" | false;        │
│   pace: "pace-per-km" | "pace-per-100m" | false;                 │
│   speedFallback: boolean;      // exibe velocidade quando pace  │
│                                 // não se aplica (ex.: ciclismo) │
│   workoutAnalysis: "full" | "limited" | "effort-only" | false;   │
│ }>                                                                │
└────────────────────────────────────────────────────────────────┘
```

Este módulo é puro (sem I/O, sem import de `@prisma/client` nem de nenhum
módulo de provider) e é consumido tanto pelo core de apresentação
(`get-activity-visual-data.ts`, substituindo `isSwimSport`/`isRunSport`) quanto
pelo enriquecedor Strava (para decidir o que incluir na análise do treino).

### Novo módulo `heart-rate-zones` (compartilhado)

```text
modules/shared/activities/heart-rate-zones/
├── compute-heart-rate-zones-from-stream.ts
│     computeHeartRateZonesFromStream(samples, maxHeartRateReference)
│       → ActivityBarSection | null   (null se samples vazio)
└── resolve-max-heart-rate-reference.ts
      resolveMaxHeartRateReference(activity, profile?)
        → number | null   // ordem de precedência do Requisito 2.4
```

Ambas as funções são puras e determinísticas (Requisito 10.3): não fazem I/O,
recebem os dados já carregados pelo chamador. Isso permite que qualquer
provider futuro com stream de FC (Polar, COROS, Suunto, Fitbit) reutilize o
mesmo cálculo sem duplicar lógica (Requisito 2.7) — o *módulo do provider*
decide *se* chama o cálculo (baseado em suas capabilities e no que seu stream
contém); o *core compartilhado* só sabe fazer a conta.

### Observação de design sobre FC máxima por idade (Requisito 2.4-b)

`UserProfile` hoje não tem campo de idade/data de nascimento (`cpfEncrypted`,
`cpfHash`, `phoneE164`, `heightCm`, `weightKg`, `onboardingCompletedAt`,
layouts — nenhum dado de idade). `resolveMaxHeartRateReference` é escrita para
aceitar um `profile` opcional com um campo de idade (`ageYears?: number`), e
implementa a fonte (b) (estimativa por idade) corretamente, mas na prática atual
esse parâmetro sempre chega como ausente — a função cai direto de (a) para (c)
sempre que a atividade não tiver `maxHeartRate > averageHeartRate`. Isso não é
um bug desta spec: é a consequência direta da ausência do dado de idade no
perfil hoje. Adicionar esse campo ao `UserProfile` (migração, tela de perfil,
onboarding) fica fora de escopo — é matéria de uma spec futura. Quando essa
spec futura existir, bastará passar o campo real para
`resolveMaxHeartRateReference`; a função já está pronta para recebê-lo.

## Components and Interfaces

### 1. Registry de enriquecimento (`modules/shared/activities/presentation/activity-detail-enrichment-registry.ts`)

```ts
import type { Activity } from "@prisma/client";
import type { ProviderId } from "@/modules/shared/integrations/types";
import type { ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";

/** Assinatura de um enriquecedor de detalhe de atividade de um provider. */
export type ActivityDetailEnricher = (
  activity: Activity,
) => Promise<ActivityVisualData | null>;

/** Fábrica que carrega o enriquecedor de um provider por dynamic import. */
type ActivityDetailEnricherLoader = () => Promise<ActivityDetailEnricher>;

/**
 * Registry `ProviderId -> loader do enriquecedor`. Adicionar um provider é
 * adicionar uma entrada aqui — nenhuma outra entrada é tocada (Requisito 1.4).
 * Providers sem módulo de enriquecimento (POLAR/COROS/SUUNTO/FITBIT hoje)
 * simplesmente não têm entrada.
 */
const ACTIVITY_DETAIL_ENRICHER_LOADERS: Partial<
  Record<ProviderId, ActivityDetailEnricherLoader>
> = {
  GARMIN: async () => (await import("@/modules/garmin")).getGarminActivityVisualData,
  STRAVA: async () => (await import("@/modules/strava")).getStravaActivityVisualData,
};

/** Resolve o loader do enriquecedor de um provider, ou `undefined`. */
export function getActivityDetailEnricherLoader(
  providerId: ProviderId,
): ActivityDetailEnricherLoader | undefined {
  return ACTIVITY_DETAIL_ENRICHER_LOADERS[providerId];
}
```

`get-activity-visual-data.ts` passa a usar este registry em vez do `if`
hardcoded:

```ts
export async function getActivityVisualData(activity: Activity): Promise<ActivityVisualData> {
  const base = buildBaseActivityVisualData(activity);
  const providerId = activity.provider as ProviderId;

  if (!hasCapability(providerId, "activityDetails")) {
    return base;
  }

  const loadEnricher = getActivityDetailEnricherLoader(providerId);
  if (!loadEnricher) {
    return base;
  }

  const enriched = await tryEnrich(loadEnricher, activity);
  return enriched ?? base;
}

async function tryEnrich(
  loadEnricher: ActivityDetailEnricherLoader,
  activity: Activity,
): Promise<ActivityVisualData | null> {
  try {
    const enrich = await loadEnricher();
    return await enrich(activity);
  } catch {
    return null; // omissão graciosa (Requisito 7.3) — nunca propaga
  }
}
```

`buildBaseActivityVisualData` passa a chamar `getMetricDisplayCategory` em vez
de `isSwimSport`/`isRunSport` (ver seção 3).

### 2. Categorias de exibição de métricas (`modules/shared/activities/metric-display-categories/index.ts`)

```ts
export type MetricDisplayCategory =
  | "endurance-pace"       // Resistência com ritmo
  | "cycling"               // Ciclismo
  | "swim"                  // Natação/desempenho aquático
  | "paddle"                // Remo e prancha
  | "wind-sail"             // Vento e vela
  | "strength-studio"       // Força e estúdio
  | "team-racket"           // Esportes coletivos e de raquete
  | "snow-ice-adventure"    // Neve, gelo e aventura
  | "multisport"            // Multiesporte (tratamento pré-existente)
  | "default";              // Padrão/desconhecido

export interface MetricDisplayRules {
  heartRateZones: boolean;
  /** `false` quando a categoria não usa nenhum dos dois. */
  cadenceOrStrokeRate: "cadence" | "stroke-rate" | false;
  pace: "pace-per-km" | "pace-per-100m" | false;
  /** Exibir velocidade/distância quando pace não se aplica (ex.: ciclismo). */
  speedFallback: boolean;
  workoutAnalysis: "full" | "limited" | "effort-only" | false;
}

export const METRIC_DISPLAY_RULES: Record<MetricDisplayCategory, MetricDisplayRules> = {
  "endurance-pace":    { heartRateZones: true,  cadenceOrStrokeRate: "cadence",     pace: "pace-per-km",  speedFallback: false, workoutAnalysis: "full" },
  cycling:             { heartRateZones: true,  cadenceOrStrokeRate: "cadence",     pace: false,          speedFallback: true,  workoutAnalysis: "full" },
  swim:                { heartRateZones: true,  cadenceOrStrokeRate: "stroke-rate", pace: "pace-per-100m",speedFallback: false, workoutAnalysis: "full" },
  paddle:               { heartRateZones: true,  cadenceOrStrokeRate: "stroke-rate", pace: false,          speedFallback: true,  workoutAnalysis: "limited" },
  "wind-sail":         { heartRateZones: true,  cadenceOrStrokeRate: false,         pace: false,          speedFallback: true,  workoutAnalysis: "limited" },
  "strength-studio":   { heartRateZones: true,  cadenceOrStrokeRate: false,         pace: false,          speedFallback: false, workoutAnalysis: "effort-only" },
  "team-racket":       { heartRateZones: true,  cadenceOrStrokeRate: false,         pace: false,          speedFallback: false, workoutAnalysis: "effort-only" },
  "snow-ice-adventure":{ heartRateZones: true,  cadenceOrStrokeRate: false,         pace: false,          speedFallback: true,  workoutAnalysis: "limited" },
  multisport:           { heartRateZones: true,  cadenceOrStrokeRate: "cadence",     pace: "pace-per-km",  speedFallback: true,  workoutAnalysis: "full" },
  default:              { heartRateZones: true,  cadenceOrStrokeRate: false,         pace: false,          speedFallback: false, workoutAnalysis: "effort-only" },
};

/** Mapa RyvanoSportType -> categoria (tabela completa no Apêndice A do requirements.md). */
export const RYVANO_SPORT_TO_METRIC_CATEGORY: Record<RyvanoSportType, MetricDisplayCategory> = {
  default: "default",
  run: "endurance-pace",
  "trail-run": "endurance-pace",
  walking: "endurance-pace",
  hiking: "endurance-pace",
  wheelchair: "endurance-pace",       // novo
  bike: "cycling",
  mtb: "cycling",
  handcycle: "cycling",               // novo
  swim: "swim",
  "open-water": "swim",
  rowing: "paddle",
  kayak: "paddle",
  "stand-up-paddle": "paddle",
  surf: "wind-sail",
  kitesurf: "wind-sail",              // novo
  sail: "wind-sail",                  // novo
  windsurf: "wind-sail",              // novo
  gym: "strength-studio",
  crossfit: "strength-studio",
  dance: "strength-studio",           // novo
  football: "team-racket",
  futsal: "team-racket",
  basketball: "team-racket",
  volleyball: "team-racket",
  tennis: "team-racket",
  padel: "team-racket",
  pickleball: "team-racket",          // novo
  badminton: "team-racket",           // novo
  squash: "team-racket",              // novo
  "table-tennis": "team-racket",      // novo
  racquetball: "team-racket",         // novo
  golf: "team-racket",                // novo
  cricket: "team-racket",             // novo
  "alpine-ski": "snow-ice-adventure", // novo
  "backcountry-ski": "snow-ice-adventure", // novo
  "nordic-ski": "snow-ice-adventure", // novo
  snowboard: "snow-ice-adventure",    // novo
  snowshoe: "snow-ice-adventure",     // novo
  "ice-skate": "snow-ice-adventure",  // novo
  "inline-skate": "snow-ice-adventure", // novo
  "roller-ski": "snow-ice-adventure", // novo
  skateboard: "snow-ice-adventure",   // novo
  "rock-climbing": "snow-ice-adventure", // novo
  triathlon: "multisport",
  duathlon: "multisport",
  aquathlon: "multisport",
};

/** Nunca lança: qualquer sportType sem entrada cai em `"default"`. */
export function getMetricDisplayCategory(sportType: RyvanoSportType): MetricDisplayCategory {
  return RYVANO_SPORT_TO_METRIC_CATEGORY[sportType] ?? "default";
}
```

`buildBaseActivityVisualData` e `getStravaActivityVisualData` consultam
`METRIC_DISPLAY_RULES[getMetricDisplayCategory(sportType)]` para decidir rótulo
de cadência (`cadence` vs `stroke-rate`), formato de pace
(`formatPace`/`formatSwimPace`/fallback de velocidade), e o que incluir na
análise do treino — nunca checando `provider` ou fazendo `sportKey.includes(...)`.

### 3. Cálculo de zonas de FC (`modules/shared/activities/heart-rate-zones/`)

```ts
// compute-heart-rate-zones-from-stream.ts

/** Amostra de FC ao longo do tempo (a unidade de "time" é segundos desde o início). */
export interface HeartRateSample {
  timeSeconds: number;
  bpm: number;
}

/** As 5 faixas de %FCmáx usadas para zonas calculadas (limites inferiores, inclusive). */
export const HEART_RATE_ZONE_PERCENT_BOUNDARIES = [0, 0.6, 0.7, 0.8, 0.9] as const;
export const HEART_RATE_ZONE_LABELS = [
  "Zona 1 · Recuperação",
  "Zona 2 · Leve",
  "Zona 3 · Moderada",
  "Zona 4 · Intensa",
  "Zona 5 · Máxima",
] as const;

/**
 * Calcula as 5 zonas de %FCmáx a partir de uma série de FC, atribuindo o tempo
 * entre amostras consecutivas à zona da amostra anterior (integração por
 * retângulos). Pura e determinística (Requisito 10.3): mesma entrada, mesma
 * saída, sem I/O.
 *
 * Retorna `null` quando `samples` está vazio ou `maxHeartRateReference <= 0`
 * (dado insuficiente para o cálculo).
 */
export function computeHeartRateZonesFromStream(
  samples: readonly HeartRateSample[],
  maxHeartRateReference: number,
): ActivityBarSection | null;
```

```ts
// resolve-max-heart-rate-reference.ts

export interface MaxHeartRateReferenceInput {
  maxHeartRate?: number | null;
  averageHeartRate?: number | null;
  /** Idade em anos, quando disponível. Hoje sempre `undefined` (ver Observação
   *  de design em Architecture) — parâmetro pronto para quando o dado existir. */
  ageYears?: number | null;
}

/**
 * Resolve a FC máxima de referência seguindo a ordem de precedência do
 * Requisito 2.4: (a) FC máxima da atividade, se maior que a FC média;
 * (b) estimativa por idade (fórmula genérica `208 - 0.7 * idade`), quando
 * `ageYears` estiver presente; (c) `null` caso nenhuma das duas esteja disponível
 * — sinal para o chamador NÃO exibir zonas calculadas.
 */
export function resolveMaxHeartRateReference(
  input: MaxHeartRateReferenceInput,
): number | null;
```

### 4. Módulo Strava — client, schemas e parsers novos

**Reconfirmação de forma do endpoint** (exigida pelo requirements.md antes de
implementar): a doc oficial vigente de `GET /activities/{id}/streams` aceita
`keys` (lista de tipos de stream desejados, ex.:
`heartrate,cadence,distance,time,velocity_smooth`) e `key_by_type` (boolean).
Quando `key_by_type=true`, a resposta é o objeto indexado por tipo
(`stravaStreamSetObjectSchema`, já existente); quando ausente/`false`, a
resposta é um array de stream-objects
(`stravaStreamSetArraySchema`). Este design fixa `key_by_type=true` em toda
chamada do novo método do client, para que o parser sempre trabalhe com a forma
indexada (mais simples), evitando ramificar sobre a forma da resposta.

`modules/strava/api/client/strava-client.ts` ganha dois métodos, seguindo
exatamente o padrão interno (`request()`) já usado por `listAthleteActivities`/
`getActivityById` — mesmo retry em 401, backoff em 429, parsing de `Fault`,
timeout e logging:

```ts
export interface GetActivityStreamsParams {
  /** Tipos de stream desejados (ex.: ["time", "heartrate", "cadence", "distance", "velocity_smooth"]). */
  keys: readonly string[];
}

class StravaClient {
  /**
   * `GET /activities/{id}/streams?keys=...&key_by_type=true`. Retorna
   * `StravaStreamSetObjectDto` (forma indexada — `key_by_type` fixado como
   * `true`). Streams não presentes na atividade simplesmente não aparecem no
   * objeto retornado (nenhuma delas é obrigatória).
   */
  async getActivityStreams(
    ctx: StravaClientContext,
    id: string | number,
    params: GetActivityStreamsParams,
  ): Promise<StravaStreamSetObjectDto>;

  /**
   * `GET /activities/{id}/laps`. Retorna `StravaLapDto[]` (reusa
   * `stravaLapListSchema`, já existente em `api/schemas/strava-lap.ts`).
   */
  async getActivityLaps(
    ctx: StravaClientContext,
    id: string | number,
  ): Promise<StravaLapDto[]>;
}
```

Nenhum schema novo é necessário para laps: `stravaLapSchema`/`stravaLapListSchema`
já existem em `modules/strava/api/schemas/strava-lap.ts` (confirmados contra a
doc oficial na Fase 5 da spec `integracoes-modulares`) e cobrem exatamente o
formato de `GET /activities/{id}/laps`. Da mesma forma, os schemas de stream já
existem em `strava-stream.ts`. Este design não introduz `strava-lap.ts` novo —
apenas os dois métodos do client acima, que reutilizam os schemas já validados.

Novos parsers, seguindo o padrão de `parse-strava-activity.ts` (DTO validado →
estrutura interna, nunca o DTO cru atravessando para `shared`/UI):

```ts
// modules/strava/parsers/parse-strava-streams.ts

export interface ParsedActivityStream {
  type: "time" | "distance" | "heartrate" | "cadence" | "watts" | "velocity_smooth" | "altitude" | "grade_smooth" | "temp";
  seriesType: "distance" | "time";
  values: number[];
}

/** Converte StravaStreamSetObjectDto (forma indexada) em streams internos, um por tipo presente. */
export function parseStravaStreams(dto: StravaStreamSetObjectDto): ParsedActivityStream[];

/** Extrai o stream de FC como HeartRateSample[] pareando com o stream `time` (quando ambos presentes). */
export function toHeartRateSamples(
  streams: ParsedActivityStream[],
): HeartRateSample[] | null;
```

```ts
// modules/strava/parsers/parse-strava-laps.ts

export interface ParsedActivityLap {
  index: number;
  durationSeconds: number | null;
  distanceMeters: number | null;
  averageHeartRate: number | null;
  averageCadence: number | null;
  averageSpeed: number | null;
  averageWatts: number | null;
}

/** Converte StravaLapDto[] em laps internos, ordenados por lap_index/split. */
export function parseStravaLaps(dtos: StravaLapDto[]): ParsedActivityLap[];
```

### 5. Módulo Strava — enriquecimento de detalhe

`modules/strava/application/activities/strava-activity-details.ts`, estrutura
paralela a `garmin-activity-details.ts`:

```ts
const STRAVA_ACTIVITY_VISUAL_CACHE_TTL_MS = 1000 * 60 * 5; // mesmo TTL do Garmin
const stravaActivityVisualCache = new Map<string, { expiresAt: number; value: ActivityVisualData | null }>();

/**
 * Enriquecedor de detalhe do Strava. Assinatura compatível com
 * `ActivityDetailEnricher` do registry. Nunca lança: qualquer falha de
 * streams/laps (401/403/404/429/5xx/timeout/payload inválido) resulta em
 * omissão graciosa do bloco correspondente, não em exceção propagada.
 */
export async function getStravaActivityVisualData(
  activity: Activity,
): Promise<ActivityVisualData | null>;
```

Passos internos (ver diagrama em Architecture): cache → busca paralela e
tolerante de streams/laps via `StravaClient` → parsers → resolução de categoria
via `getMetricDisplayCategory` → cálculo de zonas via
`computeHeartRateZonesFromStream` (quando aplicável pela categoria e pelo dado)
→ montagem de `barSections`/`metricSections` → cache do resultado.

Cada seção calculada de zonas de FC recebe um indicador de aproximação — ver
próxima subseção sobre `ActivityBarSection`.

### 6. Extensão de `ActivityBarSection` (aviso de aproximação)

`modules/shared/activities/presentation/activity-visual-data.ts` ganha dois
campos opcionais em `ActivityBarSection`, para cobrir o Requisito 2.5 (zonas
calculadas devem indicar visivelmente que são aproximadas) sem exigir um tipo de
seção totalmente novo — o Garmin nunca preenche esses campos, então seu
comportamento observável não muda:

```ts
export type ActivityBarSection = {
  id: string;
  title: string;
  description: string;
  /** Presente e `true` quando os dados desta seção são calculados/aproximados
   *  (ex.: zonas de FC do Strava calculadas por %FCmáx), nunca dados nativos
   *  exatos do provider. Ausente/`false` para seções nativas (ex.: zonas Garmin). */
  approximate?: boolean;
  /** Texto de aviso exibido como badge/nota quando `approximate` é `true`.
   *  Ex.: "Zonas estimadas por %FC máx. — podem diferir das configuradas no Strava." */
  disclaimer?: string;
  items: Array<{
    label: string;
    valueText: string;
    ratio: number;
    color: string;
  }>;
};
```

O módulo Garmin (`presentation/view-models/activity-visual-data.ts`) reexporta
o mesmo tipo — como já faz hoje — então ganha os campos automaticamente sem
qualquer edição no módulo Garmin.

### 7. Mudanças em `activity-visual-dashboard.tsx`

Duas mudanças, ambas de baixo impacto porque o componente já é agnóstico:

1. **Import path**: troca
   `import type { ... } from "@/modules/garmin/presentation/view-models"` por
   `import type { ... } from "@/modules/shared/activities/presentation/activity-visual-data"`.
   Os tipos são estruturalmente idênticos (o módulo Garmin apenas reexporta o
   shared), então não há mudança de comportamento — só remove uma dependência
   incorreta do componente genérico em um path do Garmin.
2. **Renderização do aviso de aproximação**: em `AnimatedBarList` (ou no
   cabeçalho da seção `bar:${section.id}`, via `MetricHeader`), quando
   `section.approximate` é `true`, exibir `section.disclaimer` como uma nota
   pequena abaixo da `subtitle` existente (mesmo padrão visual de
   `text-foreground/58` já usado para `description`), sem introduzir um
   componente novo — reaproveita a estrutura de card existente.

Nenhuma outra mudança estrutural: `overviewMetrics`/`barSections`/
`metricSections` continuam populando o mesmo `CustomizableCardGrid` como hoje.
Séries temporais (Requisito 11.3, preenchimento progressivo) são representadas
como `ActivityBarSection` adicionais (ex.: "FC ao longo do treino" com um item
por trecho/bucket temporal) — não é necessário um tipo de seção novo nem uma
nova primitiva visual: `AnimatedBarList` já anima `width` de 0 até o valor final
via `initial={{ width: 0 }}` / `animate={{ width }}`, que é exatamente o
"preenchimento progressivo" exigido. Isso evita introduzir um componente de
gráfico de linha novo nesta spec.

### 8. Catálogo (`modules/shared/integrations/catalog/index.ts`)

```ts
// STRAVA.capabilities ganha:
heartRateZones: true,   // calculado a partir de stream, não nativo (Requisito 8.1)
// powerZones permanece ausente/false — fora de escopo (Requisito 8.3)
```

Nenhuma mudança em `ProviderCapabilities` (`modules/shared/integrations/capabilities/index.ts`):
o campo já existe e já é boolean simples, sem distinguir nativo vs. calculado
no nível do core (Requisito 8.2). A distinção (nativo vs. calculado) fica
apenas como um detalhe interno do módulo Strava — por exemplo, o campo
`approximate` de `ActivityBarSection` já citado é o único lugar onde essa
distinção se torna visível, e vive na camada de apresentação, não no contrato
de capability.

### 9. Deprecação de `isSwimSport`/`isRunSport`

`get-activity-visual-data.ts` remove `isSwimSport`/`isRunSport` (substring) e
`buildBaseHeroStats`/`buildBaseOverviewMetrics` passam a receber a
`MetricDisplayCategory` já resolvida (via `getMetricDisplayCategory(activity.sportType)`)
em vez do `sportKey` string cru, consultando `METRIC_DISPLAY_RULES` para decidir
rótulo/formato. `garmin-activity-details.ts` **não é alterado** por este design
(mantém seu próprio `sportKey.includes("swim")`/`"run"` interno) — está fora do
escopo desta spec tocar o comportamento Garmin (Requisito 1.5); a deprecação vale
apenas para o código novo/alterado em `modules/shared/activities/presentation/**`.

## Data Models

### Stream parseado (interno, não exposto a `shared`/UI)

```ts
type ParsedActivityStream = {
  type: "time" | "distance" | "heartrate" | "cadence" | "watts"
      | "velocity_smooth" | "altitude" | "grade_smooth" | "temp";
  seriesType: "distance" | "time"; // eixo de indexação (confirmado no schema Zod existente)
  values: number[];                 // mesma ordem/tamanho do stream "time" da mesma atividade
};
```

Forma confirmada contra `stravaStreamSetObjectSchema` (já existente): cada
chave do objeto (`heartrate`, `cadence`, ...) tem `data: number[]` (via
`stravaNumberStreamSchema`) e `series_type`. `parseStravaStreams` itera as
chaves presentes no DTO validado e produz uma entrada por tipo — nenhuma é
obrigatória, refletindo que a atividade pode não ter sensor de determinada
métrica.

### Lap/split parseado (interno)

```ts
type ParsedActivityLap = {
  index: number;                    // lap_index (1-based) ou posição no array
  durationSeconds: number | null;   // elapsed_time
  distanceMeters: number | null;    // distance
  averageHeartRate: number | null;  // average_heartrate
  averageCadence: number | null;    // average_cadence
  averageSpeed: number | null;      // average_speed (m/s)
  averageWatts: number | null;      // average_watts (quando device_watts=true)
};
```

Todos os campos de métrica são `number | null` (nunca `undefined`), espelhando
a tolerância já usada em `parseStravaActivity`/`numberOrUndefined` — aqui
optamos por `null` explícito porque estas estruturas são internas ao módulo
Strava (não precisam casar com `NormalizedActivity`, que usa `undefined`).

### Amostra de FC para o cálculo de zonas

```ts
type HeartRateSample = { timeSeconds: number; bpm: number };
```

Produzida por `toHeartRateSamples`, que pareia o stream `heartrate` com o
stream `time` da mesma resposta (mesmo índice de array = mesmo instante,
conforme a doc: todos os streams pedidos de uma mesma atividade têm o mesmo
`original_size`/comprimento quando presentes). Quando o stream `time` não vier
na resposta (não deveria ocorrer se `heartrate` for pedido junto, mas é
defensivo), assume-se amostragem uniforme sintética a partir do índice, para
que o cálculo de zonas nunca falhe por ausência do eixo temporal explícito.

### Extensão da taxonomia `RyvanoSportType`

`modules/shared/activities/sport-types/index.ts` ganha 22 valores novos (lista
completa no Apêndice A do requirements.md). Forma da mudança (exemplos
representativos — os 22 seguem o mesmo padrão em `RYVANO_SPORT_TYPES`,
`RYVANO_SPORT_LABELS`, `RYVANO_TO_LEGACY` e `RYVANO_TO_REPORT_THEME`):

```ts
export type RyvanoSportType =
  | "default" | "swim" | "open-water" | "bike" | "mtb" | "run" | "trail-run"
  | "triathlon" | "duathlon" | "aquathlon" | "walking" | "hiking" | "gym"
  | "crossfit" | "football" | "futsal" | "basketball" | "volleyball" | "tennis"
  | "padel" | "surf" | "rowing" | "kayak" | "stand-up-paddle"
  // novos (Requisito 12.4):
  | "wheelchair" | "handcycle" | "kitesurf" | "sail" | "windsurf"
  | "pickleball" | "badminton" | "squash" | "table-tennis" | "racquetball"
  | "golf" | "cricket" | "dance"
  | "alpine-ski" | "backcountry-ski" | "nordic-ski" | "snowboard" | "snowshoe"
  | "ice-skate" | "inline-skate" | "roller-ski" | "skateboard" | "rock-climbing";
```

```ts
// RYVANO_SPORT_LABELS — exemplos representativos dos 22 novos:
wheelchair: "Cadeira de Rodas",
handcycle: "Handbike",
kitesurf: "Kitesurf",
sail: "Vela",
windsurf: "Windsurf",
pickleball: "Pickleball",
badminton: "Badminton",
squash: "Squash",
"table-tennis": "Tênis de Mesa",
racquetball: "Raquetebol",
golf: "Golfe",
cricket: "Críquete",
dance: "Dança",
"alpine-ski": "Esqui Alpino",
"backcountry-ski": "Esqui Fora de Pista",
"nordic-ski": "Esqui Nórdico",
snowboard: "Snowboard",
snowshoe: "Raquete de Neve",
"ice-skate": "Patinação no Gelo",
"inline-skate": "Patinação Inline",
"roller-ski": "Esqui de Rodas",
skateboard: "Skate",
"rock-climbing": "Escalada em Rocha",
```

```ts
// RYVANO_TO_LEGACY (SportIconName de lib/sports.ts — só tem
// swim|bike|run|triathlon|multisport|walking|strength|default):
wheelchair: "walking",       // resistência com ritmo, sem ícone dedicado
handcycle: "bike",
kitesurf: "default",
sail: "default",
windsurf: "default",
pickleball: "default",
// ... (demais "novos" seguem "default" ou o agrupamento mais próximo,
// exceto os de resistência/ciclismo que já têm ícone equivalente)
"alpine-ski": "default",
// ...
```

```ts
// RYVANO_TO_REPORT_THEME (ReportThemeSport em lib/reports/types.ts — ganha os
// MESMOS 22 valores novos, identidade 1:1, mesmo padrão hoje já usado):
export type ReportThemeSport =
  | "default" | "swim" | /* ... existentes ... */ | "stand-up-paddle"
  | "wheelchair" | "handcycle" | "kitesurf" | "sail" | "windsurf"
  | "pickleball" | "badminton" | "squash" | "table-tennis" | "racquetball"
  | "golf" | "cricket" | "dance"
  | "alpine-ski" | "backcountry-ski" | "nordic-ski" | "snowboard" | "snowshoe"
  | "ice-skate" | "inline-skate" | "roller-ski" | "skateboard" | "rock-climbing";
```

`lib/reports/types.ts` precisa da mesma extensão (`ReportThemeSport`) para que
o `Record<RyvanoSportType, ReportThemeSport>` de `RYVANO_TO_REPORT_THEME`
continue compilando exaustivamente — exatamente o mecanismo de segurança já
documentado no comentário existente desse mapa ("se as taxonomias divergirem no
futuro, o TypeScript acusará o erro aqui"). `lib/reports/sport-themes.ts`
(`themes: Record<ReportThemeSport, SportTheme>`) também precisa de uma entrada
por novo valor — pode reaproveitar o tema `default` ou um tema por categoria
(decisão de estilo, não coberta em detalhe aqui pois relatórios não são o foco
desta spec; a compilação exaustiva do `Record` é que obriga a entrada existir).

### `parseStravaSportType` — novas entradas (exemplos representativos)

```ts
// EXACT_SPORT_TYPES ganha (chave = normalize(sport_type) com "_" no lugar do espaço):
wheelchair: "wheelchair",
handcycle: "handcycle",
velomobile: "bike",              // já existente — equivalência funcional, sem valor dedicado
e_bike_ride: "bike",             // já existente
e_mountain_bike_ride: "mtb",     // já existente
kitesurf: "kitesurf",
sail: "sail",
windsurf: "windsurf",
pickleball: "pickleball",
badminton: "badminton",
squash: "squash",
table_tennis: "table-tennis",
racquetball: "racquetball",
golf: "golf",
cricket: "cricket",
dance: "dance",
alpine_ski: "alpine-ski",
backcountry_ski: "backcountry-ski",
nordic_ski: "nordic-ski",
snowboard: "snowboard",
snowshoe: "snowshoe",
ice_skate: "ice-skate",
inline_skate: "inline-skate",
roller_ski: "roller-ski",
skateboard: "skateboard",
rock_climbing: "rock-climbing",
```

Nenhuma regra de `KEYWORD_RULES` nova é estritamente necessária para esses
valores (o Strava usa `sport_type` estável em PascalCase sem variação de texto
livre), mas duas entradas de fallback (`kitesurf`, `windsurf`, `sail`) recebem
uma regra de palavra-chave por robustez, já que "surf"/"sail"/"wind" têm
potencial de colisão com o `surf` existente — a ordem de avaliação em
`KEYWORD_RULES` continua sendo "mais específico antes de mais genérico"
(mesmo princípio já documentado no arquivo), então `kitesurf`/`windsurf` (regra
nova) precisam ser avaliados antes da regra existente `surf: ["surf"]`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Enriquecimento é resolvido por capability e registry, não por identidade do provider

*For any* `ProviderId` (conhecido ou sintético/fake registrado em teste) que declare a capability `activityDetails` e tenha um enriquecedor registrado que retorne dados não-nulos, `getActivityVisualData` deve retornar o resultado desse enriquecedor, independentemente de qual `ProviderId` específico seja.

**Validates: Requirements 1.1, 1.2**

### Property 2: Ausência de enriquecedor cai sempre na visão base, nunca em erro ou vazio

*For any* atividade cujo provider não tenha capability `activityDetails` OU não tenha entrada no registry de enriquecimento, `getActivityVisualData` deve retornar exatamente `buildBaseActivityVisualData(activity)`, sem lançar exceção.

**Validates: Requirements 1.3, 7.3**

### Property 3: Zonas de FC nativas têm prioridade sobre zonas calculadas

*For any* atividade cujo provider ofereça, simultaneamente, uma fonte de zona de FC nativa e um stream de FC, o resultado final da seção de zonas de frequência cardíaca deve ser o dado nativo, e a seção não deve carregar `approximate: true`.

**Validates: Requirements 2.2**

### Property 4: Cálculo de zonas por stream produz exatamente 5 faixas cobrindo o tempo total, e omissão sem dado suficiente

*For any* série não-vazia de amostras de FC e qualquer FC máxima de referência positiva, `computeHeartRateZonesFromStream` deve retornar uma seção com exatamente 5 itens, cuja soma dos tempos representados é igual ao intervalo total coberto pela série; *for any* série vazia OU FC máxima de referência não positiva, a função deve retornar `null`, nunca lançar.

**Validates: Requirements 2.3, 2.6**

### Property 5: Ordem de precedência da FC máxima de referência é respeitada

*For any* combinação de `maxHeartRate`, `averageHeartRate` e `ageYears` (presentes ou ausentes), `resolveMaxHeartRateReference` deve retornar: o `maxHeartRate` da atividade quando maior que `averageHeartRate`; senão, a estimativa por idade quando `ageYears` estiver presente; senão, `null` — nesta ordem exata, sem exceção.

**Validates: Requirements 2.4**

### Property 6: Métricas agregadas de FC aparecem se e somente se os dados normalizados existem

*For any* atividade normalizada, `overviewMetrics` deve conter a linha "FC média" se e somente se `averageHeartRate` estiver presente, e "FC máxima" se e somente se `maxHeartRate` estiver presente — sem lançar exceção em nenhum dos casos.

**Validates: Requirements 3.1, 3.3**

### Property 7: Rotulagem de cadência/frequência de braçadas e formato de ritmo dependem só da categoria de exibição de métricas

*For any* `RyvanoSportType` e qualquer valor numérico de `averageCadence`/`averagePace`/`averageSpeed`, o rótulo e o formato exibidos (cadência vs. frequência de braçadas; pace por km vs. por 100m vs. velocidade) devem ser determinados inteiramente por `getMetricDisplayCategory(sportType)`, produzindo o mesmo resultado para duas atividades com o mesmo `sportType` e providers diferentes.

**Validates: Requirements 4.1, 4.2, 4.5, 5.1, 5.2, 5.5**

### Property 8: Categorias sem cadência/ritmo nunca exibem essas métricas mesmo com dado bruto presente

*For any* atividade cuja `MetricDisplayCategory` não permita cadência/frequência de braçadas (`cadenceOrStrokeRate === false`) ou não permita ritmo/pace (`pace === false`), a métrica correspondente não deve aparecer em `overviewMetrics` nem nos sub-blocos da análise do treino, mesmo que `averageCadence`/`averagePace`/`averageSpeed` estejam presentes no dado normalizado.

**Validates: Requirements 4.6, 5.6, 6.6**

### Property 9: Ausência de dado específico de modalidade é omissão graciosa, nunca erro/zero/mensagem de indisponibilidade

*For any* atividade de natação sem stream de frequência de braçadas (ou, de forma geral, qualquer atividade sem um dado opcional específico de sua categoria), o sistema deve omitir a métrica/seção correspondente sem lançar exceção, sem produzir um valor `0`/`"—"` enganoso rotulado como se fosse real, e sem incluir uma mensagem de "recurso indisponível".

**Validates: Requirements 4.4**

### Property 10: A seção de análise do treino reflete exatamente as fontes de dado disponíveis

*For any* combinação de disponibilidade das três fontes (zonas de FC, laps/splits, streams), a seção de análise do treino deve estar presente se e somente se ao menos uma fonte estiver disponível, e deve conter exatamente os sub-blocos correspondentes às fontes presentes (nenhum sub-bloco vazio, nenhum sub-bloco de uma fonte ausente).

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

### Property 11: Qualquer provider satisfazendo as capabilities relevantes funciona sem alteração do core

*For any* `ProviderId` sintético registrado apenas em teste (simulando um provider futuro) que declare `streams`/`laps`/`heartRateZones` e forneça um enriquecedor válido no registry, `getActivityVisualData` deve produzir uma `ActivityVisualData` enriquecida para esse provider, usando exatamente o mesmo caminho de código já exercitado por Garmin/Strava.

**Validates: Requirements 7.2**

### Property 12: `getActivityVisualData` nunca lança e sempre retorna uma visão válida, para qualquer combinação de dados opcionais ausentes

*For any* atividade normalizada e qualquer subconjunto de dados opcionais ausentes (zonas nativas, stream de FC, stream de cadência, laps, dados fisiológicos), `getActivityVisualData` deve retornar uma `ActivityVisualData` com `heroStats`/`overviewMetrics` não vazios (ao menos os campos mínimos) e nunca lançar exceção.

**Validates: Requirements 7.3**

### Property 13: Falhas de rede/validação em streams ou laps do Strava nunca propagam para o enriquecimento

*For any* tipo de falha simulada (401/403/404/429/5xx/timeout/payload que falha na validação Zod) ocorrendo na busca de streams OU de laps, `getStravaActivityVisualData` deve tratar essa falha como ausência do dado correspondente (omitindo o bloco relacionado) e retornar normalmente, nunca propagando a exceção.

**Validates: Requirements 9.4**

### Property 14: Parsers de stream/lap produzem estrutura interna bem formada para qualquer DTO válido

*For any* `StravaStreamSetObjectDto`/`StravaLapDto[]` que passe na validação Zod (incluindo casos com campos opcionais ausentes), `parseStravaStreams`/`parseStravaLaps` devem produzir uma lista de estruturas internas sem lançar exceção, preservando os tipos/índices presentes no DTO de entrada.

**Validates: Requirements 9.3**

### Property 15: Cálculo de zonas de FC é puro e determinístico

*For any* série de amostras de FC e FC máxima de referência, chamar `computeHeartRateZonesFromStream` duas vezes com os mesmos argumentos deve produzir resultados estruturalmente idênticos, sem qualquer efeito observável de rede ou I/O.

**Validates: Requirements 10.3**

### Property 16: Cache de enriquecimento evita buscas repetidas para a mesma atividade

*For any* atividade não alterada (mesmo `id`/`updatedAt`), chamar `getStravaActivityVisualData` múltiplas vezes dentro do TTL do cache deve resultar em exatamente uma chamada real aos métodos do client subjacente (streams/laps), independentemente de quantas vezes a função for chamada.

**Validates: Requirements 10.4**

### Property 17: Categoria de exibição de métricas é uma função pura do tipo de esporte canônico

*For any* `RyvanoSportType`, `getMetricDisplayCategory` deve retornar sempre a mesma `MetricDisplayCategory`, independentemente do provider de origem da atividade que carrega esse `sportType` — ou seja, duas atividades com o mesmo `sportType` e providers diferentes produzem a mesma categoria.

**Validates: Requirements 12.1**

### Property 18: `sport_type` desconhecido de qualquer provider cai sempre na categoria padrão, sem erro

*For any* string arbitrária que não corresponda a nenhum valor conhecido em `EXACT_SPORT_TYPES` nem a nenhuma palavra-chave de `KEYWORD_RULES`, `parseStravaSportType` deve retornar `"default"`, e `getMetricDisplayCategory("default")` deve retornar a categoria de fallback — em nenhum caso lançando exceção ou interrompendo a montagem da visão.

**Validates: Requirements 12.3**

## Error Handling

| Cenário | Tratamento |
|---|---|
| `getActivityStreams`/`getActivityLaps` retornam 401 (mesmo após o retry único já existente no client) | `StravaAuthError` capturada pelo enriquecedor (`loadOptional`/try-catch dedicado); bloco de zonas/laps correspondente é omitido; conexão não é marcada aqui (isso já é responsabilidade do fluxo de sync/probe existente, fora do escopo desta função de leitura) |
| 403 | Tratado como ausência de permissão para este recurso específico; mesmo caminho de omissão graciosa que 401 |
| 404 (atividade sem streams/laps, ou removida) | Tratado como ausência de dado, não como erro — omite o bloco correspondente |
| 429 (`StravaRateLimitExceededError`) | Capturada pelo enriquecedor; bloco omitido nesta renderização; a request de detalhe não bloqueia esperando o `retryAfterMs` (a página deve responder rápido); o cache em memória evita martelar o rate limit em renders subsequentes dentro do TTL |
| 5xx / timeout | Capturados via try/catch amplo em torno de cada chamada (`loadOptional`, mesmo padrão do Garmin); bloco omitido |
| Payload que falha na validação Zod (`StravaClientError` código `STRAVA_INVALID_RESPONSE`) | Capturado; bloco omitido; nenhum DTO inválido atravessa para o parser |
| `sportType` desconhecido/não mapeado (de qualquer provider, atual ou futuro) | `getMetricDisplayCategory` retorna `"default"`; `parseStravaSportType` retorna `"default"`; a visão base sempre é renderizável nessa categoria (duração, distância, FC agregada quando houver) |
| `resolveMaxHeartRateReference` retorna `null` (sem FC máxima de referência disponível) | Nenhuma zona calculada é produzida; a seção de zonas simplesmente não é incluída em `barSections`, sem erro |
| `computeHeartRateZonesFromStream` recebe série vazia | Retorna `null`; o chamador trata como ausência de dado |
| Enriquecedor de qualquer provider lança (erro não previsto/bug) | `tryEnrich` no dispatcher central (`get-activity-visual-data.ts`) captura qualquer exceção e retorna `null`, fazendo `getActivityVisualData` cair na visão base — nenhuma falha de enriquecimento derruba a renderização da página (Requisito 7.3, 7.4) |
| Cache do Strava armazena `null` (nenhum dado disponível para a atividade) | Reutilizado como cache-hit dentro do TTL, evitando repetir chamadas de rede que provavelmente falhariam de novo (mesmo padrão do `garminActivityVisualCache`) |

Em nenhum desses cenários uma exceção é permitida a propagar até
`app/app/atividades/[id]/page.tsx`: a barreira final é `tryEnrich` no
dispatcher central, que garante que `getActivityVisualData` sempre resolve
(nunca rejeita) — reforçando a garantia já existente hoje no comentário da
função ("NUNCA retorna `null`").

## Testing Strategy

**Abordagem dual**: testes de propriedade (`fast-check`, já a escolha natural
para o ecossistema TypeScript/vitest do projeto — nenhuma implementação de PBT
do zero) para as funções puras e para o comportamento do dispatcher com
providers sintéticos; testes unitários de exemplo para casos concretos,
integrações com o `StravaClient` (mockado) e para as tabelas fixas
(Apêndice A, categorias). Mínimo de 100 iterações por teste de propriedade.
Cada teste de propriedade referencia sua propriedade do design via comentário
no formato **Feature: detalhe-atividade-multi-provider, Property {number}:
{texto resumido da propriedade}**.

### Testes de propriedade (unitários, funções puras)

- `computeHeartRateZonesFromStream`: Property 4, Property 15 — gerar séries de
  FC de tamanho e valores arbitrários (incluindo vazias) e FC máx. de
  referência arbitrária (incluindo zero/negativa); verificar 5 faixas, soma de
  tempos, determinismo, e `null` nos casos degenerados.
- `resolveMaxHeartRateReference`: Property 5 — gerar combinações arbitrárias de
  `maxHeartRate`/`averageHeartRate`/`ageYears` (presentes/ausentes) e verificar
  a ordem de precedência exata.
- `getMetricDisplayCategory`: Property 17 — gerar pares de `RyvanoSportType`
  idênticos com "providers" arbitrários simulados no contexto do teste (a
  função não recebe provider, então a propriedade é reforçada verificando que
  a assinatura da função nem aceita esse parâmetro) e verificar consistência.
- `parseStravaSportType` com strings arbitrárias desconhecidas: Property 18 —
  gerar strings aleatórias (excluindo, via filtro do gerador, os valores
  conhecidos de `EXACT_SPORT_TYPES` e as palavras-chave de `KEYWORD_RULES`) e
  verificar que o retorno é sempre `"default"`.
- `getActivityVisualData`/dispatcher com providers sintéticos registrados só em
  teste (via injeção de um registry de teste ou de um `ProviderId` fake
  registrado temporariamente): Property 1, Property 2, Property 11, Property 12
  — gerar combinações arbitrárias de capability presente/ausente, enriquecedor
  presente/ausente/lançando/retornando `null`/retornando dado, e verificar que
  o resultado final nunca lança e sempre cai no caminho esperado.
- `getStravaActivityVisualData` com `StravaClient` mockado: Property 9,
  Property 13, Property 16 — gerar combinações arbitrárias de qual chamada
  (streams/laps) falha e com qual tipo de erro (enum de status simulados);
  verificar omissão graciosa; e verificar contagem de chamadas ao mock através
  de múltiplas invocações dentro do TTL do cache.
- Rotulagem/formatação por categoria (Property 7, Property 8): gerar
  `RyvanoSportType` arbitrário + valores numéricos arbitrários de
  cadência/pace/velocidade e verificar que o rótulo/presença da métrica
  respeita exatamente `METRIC_DISPLAY_RULES[getMetricDisplayCategory(sportType)]`.
- Composição da seção de análise do treino (Property 10): gerar os 8
  subconjuntos possíveis de disponibilidade das 3 fontes (zonas/laps/streams) e
  verificar presença/ausência da seção e de cada sub-bloco.
- `parseStravaStreams`/`parseStravaLaps` (Property 14): gerar DTOs válidos
  arbitrários (usando os schemas Zod existentes como gerador base, ou um
  gerador `fast-check` alinhado à forma dos schemas) e verificar que o parser
  nunca lança e preserva os tipos/campos presentes.
- Métricas agregadas de FC (Property 6): gerar atividades com
  `averageHeartRate`/`maxHeartRate` presentes/ausentes de forma independente e
  verificar presença condicional das linhas.
- Zonas nativas vs. calculadas (Property 3): gerar cenários com ambas as fontes
  presentes/ausentes de forma independente (usando um provider sintético de
  teste que pode oferecer as duas) e verificar prioridade da fonte nativa.

### Testes de exemplo / integração

- Catálogo: `heartRateZones: true` e ausência de `powerZones: true` para
  STRAVA (verificação pontual, Requisitos 8.1, 8.3).
- Tabela exaustiva do Apêndice A: um teste tabular cobrindo todos os
  `sport_type` do Strava listados (existentes + 22 novos + equivalências
  funcionais como `Velomobile`/`EBikeRide`/`EMountainBikeRide`), verificando
  `parseStravaSportType` → `RyvanoSportType` → `getMetricDisplayCategory`
  ponta a ponta (Requisitos 12.2, 12.4, 12.5, 12.6).
- `StravaClient.getActivityStreams`/`getActivityLaps`: espelhar os testes já
  existentes de `strava-client.test.ts` (sucesso 200, 401 com retry, 429,
  payload inválido), usando fixtures sanitizadas novas em
  `modules/strava/tests/fixtures/` (ex.: `activity-streams.json`,
  `activity-laps.json`, sem dados reais de usuários).
- Não-regressão Garmin: reexecutar/adaptar os testes existentes de
  `garmin-activity-details` (se existirem) após a introdução do registry,
  garantindo que a saída para atividades Garmin é idêntica à anterior
  (Requisito 1.5).
- `logIntegrationEvent` chamado com `provider`/`operation`/`status` corretos ao
  buscar streams/laps (Requisito 10.2) — teste de exemplo verificando a chamada
  mockada.
- Animação: teste de exemplo com `useReducedMotion` mockado como `true`,
  verificando que as novas seções não recebem as variantes de animação
  contínua (Requisito 11.2); teste de exemplo verificando que
  `CustomizableCardGrid` recebe os mesmos itens de drag/resize independente das
  novas seções (Requisito 11.4, não-regressão).
- Import path de `activity-visual-dashboard.tsx`: teste de tipo/compilação
  (`tsc`) garante que o novo import de `@/modules/shared/activities/presentation/activity-visual-data`
  é estruturalmente compatível com o consumo existente.

### Verificação

`npm run build` (typecheck do Next, incluindo os novos tipos exaustivos de
`RyvanoSportType`/`ReportThemeSport`) + `npm test` (vitest) após cada fase de
implementação; `npm run lint` quando aplicável. Fixtures de streams/laps do
Strava sanitizadas (sem PII, sem tokens) em `modules/strava/tests/fixtures/`,
seguindo o padrão já usado pelas fixtures existentes desse diretório.
