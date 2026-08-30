/**
 * Montagem provider-agnostic do detalhe visual de uma atividade.
 *
 * `getActivityVisualData(activity)` é a **fonte única** consumida pela página de
 * detalhe (`app/app/atividades/[id]/page.tsx`). Ela:
 *
 * 1. Monta a visão base a partir dos campos normalizados de `Activity`
 *    (`sportType` canônico + métricas), funcionando para **qualquer** provider.
 * 2. Enriquece a visão via o módulo do provider quando a capability de detalhe
 *    existir (ex.: Garmin traz zonas/splits/clima ao vivo). O enriquecimento é
 *    resolvido de forma tardia (dynamic import) para não criar dependência
 *    estática do core em um provider específico — o core continua provider-agnostic
 *    e novos providers (Strava na Fase 5) plugam aqui sem alterar consumidores.
 *
 * NUNCA retorna `null` só por a atividade não ser Garmin: providers sem módulo
 * de enriquecimento (ou sem a capability) exibem a visão base normalizada.
 *
 * _Requisitos: 7.6, 7.7_
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
import {
  getRyvanoSportLabel,
  isRyvanoSportType,
} from "@/modules/shared/activities/sport-types";
import { hasCapability } from "@/modules/shared/integrations/capabilities";
import type { ProviderId } from "@/modules/shared/integrations/types";

import type {
  ActivityHeroStat,
  ActivityMetricRow,
  ActivityVisualData,
} from "@/modules/shared/activities/presentation/activity-visual-data";

function isSwimSport(sportKey: string): boolean {
  return sportKey.includes("swim") || sportKey === "open-water";
}

function isRunSport(sportKey: string): boolean {
  return sportKey.includes("run");
}

function resolveSportKey(activity: Activity): string {
  const raw = activity.sportType?.trim();
  return raw ? raw.toLowerCase() : "default";
}

function resolveSportLabel(activity: Activity, sportKey: string): string {
  if (isRyvanoSportType(sportKey)) {
    return getRyvanoSportLabel(sportKey);
  }

  return humanizeActivityLabel(activity.sportType) ?? "Atividade";
}

function buildBaseHeroStats(activity: Activity, sportKey: string): ActivityHeroStat[] {
  const stats: ActivityHeroStat[] = [
    { label: "Duração", value: formatDuration(activity.durationSeconds), tone: "text-cyan-200" },
    { label: "Distância", value: formatDistance(activity.distanceMeters), tone: "text-fuchsia-200" },
  ];

  const isSwim = isSwimSport(sportKey);
  const isRun = isRunSport(sportKey);

  const thirdValue = isSwim
    ? formatSwimPace(activity.averagePace)
    : isRun
      ? formatPace(activity.averagePace)
      : activity.averageSpeed
        ? formatSpeed(activity.averageSpeed * 3.6)
        : formatCalories(activity.calories);

  stats.push({
    label: isSwim ? "Ritmo" : isRun ? "Pace" : activity.averageSpeed ? "Velocidade" : "Calorias",
    value: thirdValue,
    tone: "text-emerald-200",
  });

  return stats.filter((item) => item.value !== "—");
}

function buildBaseOverviewMetrics(activity: Activity, sportKey: string): ActivityMetricRow[] {
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

  if (isSwimSport(sportKey)) {
    push("Ritmo médio", formatSwimPace(activity.averagePace));
    push("Cadência de nado", formatCadence(activity.averageCadence));
  } else if (isRunSport(sportKey)) {
    push("Pace médio", formatPace(activity.averagePace));
    push("Cadência", formatCadence(activity.averageCadence));
  } else {
    push("Velocidade média", formatSpeed(activity.averageSpeed ? activity.averageSpeed * 3.6 : null));
    push("Velocidade máx.", formatSpeed(activity.maxSpeed ? activity.maxSpeed * 3.6 : null));
    push("Cadência", formatCadence(activity.averageCadence));
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

  return {
    sportLabel: resolveSportLabel(activity, sportKey),
    sportKey,
    provider: activity.provider,
    startedAtLabel: formatDateTime(activity.startedAt),
    heroStats: buildBaseHeroStats(activity, sportKey),
    overviewMetrics: buildBaseOverviewMetrics(activity, sportKey),
    barSections: [],
    metricSections: [],
  };
}

/**
 * Enriquecimento específico do Garmin, carregado tardiamente para não acoplar o
 * core ao módulo do provider (evita ciclo `shared -> garmin -> shared`).
 * Retorna a visão rica quando disponível, ou `null` para cair na visão base.
 */
async function enrichGarminActivityVisualData(
  activity: Activity,
): Promise<ActivityVisualData | null> {
  try {
    const { getGarminActivityVisualData } = await import("@/modules/garmin");
    return await getGarminActivityVisualData(activity);
  } catch {
    return null;
  }
}

/**
 * Retorna o detalhe visual de uma atividade de qualquer provider.
 *
 * Monta a visão base normalizada e, quando o provider oferece a capability de
 * detalhe (`activityDetails`) e há um enriquecedor disponível, mescla os dados
 * ricos do provider. Nunca retorna `null`.
 *
 * _Requisitos: 7.6, 7.7_
 */
export async function getActivityVisualData(
  activity: Activity,
): Promise<ActivityVisualData> {
  const base = buildBaseActivityVisualData(activity);
  const providerId = activity.provider as ProviderId;

  if (providerId === "GARMIN" && hasCapability(providerId, "activityDetails")) {
    const enriched = await enrichGarminActivityVisualData(activity);
    if (enriched) {
      return enriched;
    }
  }

  return base;
}
