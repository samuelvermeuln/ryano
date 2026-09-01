/**
 * Montagem provider-agnostic do detalhe visual de uma atividade.
 *
 * `getActivityVisualData(activity)` é a **fonte única** consumida pela página de
 * detalhe (`app/app/atividades/[id]/page.tsx`). Ela:
 *
 * 1. Monta a visão base a partir dos campos normalizados de `Activity`
 *    (`sportType` canônico + métricas), funcionando para **qualquer** provider.
 *    Quais métricas fazem sentido exibir (ritmo e em qual formato, cadência vs.
 *    frequência de braçadas, velocidade) vem de
 *    `METRIC_DISPLAY_RULES[getMetricDisplayCategory(sportType)]` — categoria da
 *    modalidade canônica, nunca heurística de substring nem provider
 *    (Requisitos 4.1, 4.2, 4.5, 4.6, 5.1, 5.2, 5.5, 5.6).
 * 2. Enriquece a visão via o módulo do provider quando a capability de detalhe
 *    (`activityDetails`) existir **e** houver um enriquecedor registrado no
 *    `activity-detail-enrichment-registry` para aquele `ProviderId`. O
 *    enriquecedor é carregado tardiamente (dynamic import dentro do registry)
 *    para não criar dependência estática do core em um provider específico.
 *
 * Este módulo não conhece nenhum provider por nome: a decisão é capability +
 * lookup no registry, nunca `provider === "GARMIN"` (Requisitos 1.1, 7.1).
 * Registrar um provider novo não altera este arquivo (Requisito 1.4).
 *
 * NUNCA retorna `null` e nunca lança: provider sem capability, sem entrada no
 * registry, ou cujo enriquecedor falhe, exibe a visão base normalizada
 * (Requisitos 1.3, 7.3, 7.4).
 *
 * _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2, 4.5, 4.6, 5.1, 5.2, 5.5,
 * 5.6, 7.1, 7.3, 7.4_
 */

import type { Activity } from "@prisma/client";

// Import de efeito colateral: registra o resolver de capabilities do catálogo,
// garantindo que `hasCapability` funcione mesmo que nada mais tenha carregado o
// catálogo neste caminho de execução.
import "@/modules/shared/integrations/catalog";

import {
  formatCadence,
  formatCalories,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatPower,
  formatSpeed,
  formatSwimPace,
} from "@/lib/format";
import { humanizeActivityLabel } from "@/lib/activity-text";
import type { MetricDisplayRules } from "@/modules/shared/activities/metric-display-categories";
import {
  METRIC_DISPLAY_RULES,
  getMetricDisplayCategory,
} from "@/modules/shared/activities/metric-display-categories";
import {
  getRyvanoSportLabel,
  isRyvanoSportType,
} from "@/modules/shared/activities/sport-types";
import { hasCapability } from "@/modules/shared/integrations/capabilities";
import type { ProviderId } from "@/modules/shared/integrations/types";

import type { ActivityDetailEnricherLoader } from "@/modules/shared/activities/presentation/activity-detail-enrichment-registry";
import { getActivityDetailEnricherLoader } from "@/modules/shared/activities/presentation/activity-detail-enrichment-registry";
import type {
  ActivityHeroStat,
  ActivityMetricRow,
  ActivityVisualData,
} from "@/modules/shared/activities/presentation/activity-visual-data";

function resolveSportKey(activity: Activity): string {
  const raw = activity.sportType?.trim();
  return raw ? raw.toLowerCase() : "default";
}

/**
 * Resolve as regras de exibição de métricas da atividade a partir da modalidade
 * canônica — nunca do provider de origem (Requisitos 4.5, 5.5, 7.1).
 *
 * `resolveSportKey` devolve a string crua em minúsculas, que pode não ser um
 * `RyvanoSportType` válido (dado legado/persistido por um provider antes da
 * normalização, ou modalidade desconhecida). Nesse caso cai na categoria
 * `"default"`, que não assume ritmo, cadência nem velocidade — a mesma omissão
 * segura exigida para `sport_type` desconhecido (Requisito 12.3). Nunca lança.
 */
function resolveMetricDisplayRules(sportKey: string): MetricDisplayRules {
  const category = isRyvanoSportType(sportKey)
    ? getMetricDisplayCategory(sportKey)
    : "default";

  return METRIC_DISPLAY_RULES[category];
}

function resolveSportLabel(activity: Activity, sportKey: string): string {
  if (isRyvanoSportType(sportKey)) {
    return getRyvanoSportLabel(sportKey);
  }

  return humanizeActivityLabel(activity.sportType) ?? "Atividade";
}

/**
 * Terceiro destaque do herói, decidido pela categoria de exibição de métricas:
 * ritmo por 100 m (natação), pace por km (resistência com ritmo), velocidade
 * (categorias com `speedFallback`) ou calorias como último recurso.
 *
 * Categorias sem ritmo e sem fallback de velocidade (força e estúdio, coletivos
 * e de raquete, padrão) nunca exibem ritmo/velocidade aqui, mesmo que exista
 * `averageSpeed`/`averagePace` bruto no dado normalizado (Requisito 5.6).
 */
function resolveThirdHeroStat(
  activity: Activity,
  rules: MetricDisplayRules,
): ActivityHeroStat {
  const tone = "text-emerald-200";

  if (rules.pace === "pace-per-100m") {
    return { label: "Ritmo", value: formatSwimPace(activity.averagePace), tone };
  }

  if (rules.pace === "pace-per-km") {
    return { label: "Pace", value: formatPace(activity.averagePace), tone };
  }

  if (rules.speedFallback && activity.averageSpeed) {
    return { label: "Velocidade", value: formatSpeed(activity.averageSpeed * 3.6), tone };
  }

  return { label: "Calorias", value: formatCalories(activity.calories), tone };
}

function buildBaseHeroStats(
  activity: Activity,
  rules: MetricDisplayRules,
): ActivityHeroStat[] {
  const stats: ActivityHeroStat[] = [
    { label: "Duração", value: formatDuration(activity.durationSeconds), tone: "text-cyan-200" },
    { label: "Distância", value: formatDistance(activity.distanceMeters), tone: "text-fuchsia-200" },
    resolveThirdHeroStat(activity, rules),
  ];

  return stats.filter((item) => item.value !== "—");
}

/**
 * Métricas do resumo, decididas pela categoria de exibição de métricas.
 *
 * As linhas comuns (início, duração, distância, calorias, FC agregada,
 * elevação) valem para qualquer modalidade. Ritmo/pace, velocidade,
 * cadência/frequência de braçadas e potência são condicionais:
 *
 * - ritmo/pace: `rules.pace` decide o formato (`formatSwimPace` por 100 m vs.
 *   `formatPace` por km) e `false` omite a linha (Requisitos 5.1, 5.2, 5.6);
 * - cadência: `rules.cadenceOrStrokeRate` decide o rótulo (cadência vs.
 *   frequência de braçadas) e `false` omite a linha mesmo com
 *   `averageCadence` bruto presente (Requisitos 4.1, 4.2, 4.6);
 * - velocidade/potência: só nas categorias com `rules.speedFallback`, que são
 *   as que medem esforço por velocidade em vez de ritmo (Requisito 5.3).
 *
 * Valores ausentes viram `"—"` nos formatadores e são descartados pelo `push`,
 * de modo que a omissão é sempre graciosa (Requisitos 4.4, 7.3).
 */
function buildBaseOverviewMetrics(
  activity: Activity,
  rules: MetricDisplayRules,
): ActivityMetricRow[] {
  const rows: ActivityMetricRow[] = [];
  const push = (label: string, value: string) => {
    if (value !== "—") {
      rows.push({ label, value });
    }
  };

  push("Início", formatDateTime(activity.startedAt));
  push("Duração", formatDuration(activity.durationSeconds));
  push("Distância", formatDistance(activity.distanceMeters));
  push("Calorias", formatCalories(activity.calories));
  push("FC média", formatHeartRate(activity.averageHeartRate));
  push("FC máxima", formatHeartRate(activity.maxHeartRate));
  push("Elevação", formatElevation(activity.elevationGain));

  if (rules.pace === "pace-per-100m") {
    push("Ritmo médio", formatSwimPace(activity.averagePace));
  } else if (rules.pace === "pace-per-km") {
    push("Pace médio", formatPace(activity.averagePace));
  }

  if (rules.speedFallback) {
    push("Velocidade média", formatSpeed(activity.averageSpeed ? activity.averageSpeed * 3.6 : null));
    push("Velocidade máx.", formatSpeed(activity.maxSpeed ? activity.maxSpeed * 3.6 : null));
  }

  if (rules.cadenceOrStrokeRate === "stroke-rate") {
    push("Cadência de nado", formatCadence(activity.averageCadence));
  } else if (rules.cadenceOrStrokeRate === "cadence") {
    push("Cadência", formatCadence(activity.averageCadence));
  }

  if (rules.speedFallback) {
    push("Potência média", formatPower(activity.averagePower));
    push("Potência máx.", formatPower(activity.maxPower));
  }

  return rows;
}

/**
 * Monta a visão base do detalhe de atividade a partir dos campos normalizados,
 * sem acessar nenhum provider. Serve para qualquer origem.
 */
export function buildBaseActivityVisualData(activity: Activity): ActivityVisualData {
  const sportKey = resolveSportKey(activity);
  const rules = resolveMetricDisplayRules(sportKey);

  return {
    sportLabel: resolveSportLabel(activity, sportKey),
    sportKey,
    provider: activity.provider,
    startedAtLabel: formatDateTime(activity.startedAt),
    heroStats: buildBaseHeroStats(activity, rules),
    overviewMetrics: buildBaseOverviewMetrics(activity, rules),
    barSections: [],
    metricSections: [],
  };
}

/**
 * Executa um enriquecedor do registry sem nunca lançar.
 *
 * Absorve tanto a falha de carregamento do módulo do provider (dynamic import
 * ausente / export ainda não publicado) quanto qualquer erro do próprio
 * enriquecedor (rede, validação, bug), traduzindo tudo para `null` = "sem
 * enriquecimento". É a barreira final que garante que uma falha de provider
 * nunca derruba a renderização da página de detalhe.
 *
 * _Requisitos: 1.3, 7.3, 7.4_
 */
async function tryEnrich(
  loadEnricher: ActivityDetailEnricherLoader,
  activity: Activity,
): Promise<ActivityVisualData | null> {
  try {
    const enrich = await loadEnricher();
    return await enrich(activity);
  } catch {
    return null;
  }
}

/**
 * Retorna o detalhe visual de uma atividade de qualquer provider.
 *
 * Monta a visão base normalizada e, quando o provider oferece a capability de
 * detalhe (`activityDetails`) e há um enriquecedor registrado no registry,
 * mescla os dados ricos do provider. A decisão é tomada por **capability +
 * registry**, nunca por identidade do provider — adicionar um provider novo é
 * adicionar uma entrada no registry, sem tocar nesta função (Requisitos 1.1,
 * 1.4, 7.1, 7.2). Nunca retorna `null` e nunca lança.
 *
 * _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 7.3, 7.4_
 */
export async function getActivityVisualData(
  activity: Activity,
): Promise<ActivityVisualData> {
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
