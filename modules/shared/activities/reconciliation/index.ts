/**
 * Camada de reconciliação multi-provider — DESABILITADA POR PADRÃO.
 *
 * Esta camada existe para deixar espaço arquitetural para, no futuro, comparar
 * representações da MESMA atividade em providers diferentes (ex.: uma corrida
 * que aparece tanto no Garmin quanto no Strava). Ela NÃO transforma essa
 * possibilidade técnica em permissão: a reconciliação só roda quando habilitada
 * explicitamente por AMBOS:
 *
 *   1. o flag de ambiente `STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED`
 *      (default `false`), e
 *   2. o Policy Gate, via `assertPolicy(provider, "combine")`, que por sua vez
 *      exige `allowCrossProviderCombination` na política do provider.
 *
 * Enquanto qualquer uma das travas estiver desligada (o estado padrão), o ponto
 * de entrada `reconcileActivities` é um NO-OP: retorna resultado vazio, não
 * combina nada e, principalmente, NUNCA faz merge automático entre providers
 * (Requisito 16.1, 16.2, 16.5).
 *
 * Garantias importantes:
 * - Usuários com um único provider NÃO dependem desta camada: ela é puramente
 *   aditiva e desligada por padrão (Requisito 16.4).
 * - Não há sobrescrita silenciosa de métricas entre providers. As diferenças
 *   são apenas SUPERFICIADAS (via `MetricComparison`), preservando a
 *   proveniência de cada valor (`ProviderMetric`) — a decisão de qual valor usar
 *   fica fora desta camada e nunca é automática (Requisito 16.2, 16.5).
 * - Nenhuma atividade "mesclada" é persistida por esta camada; ela é pura e
 *   testável (sem I/O).
 *
 * _Requisitos: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 15.6_
 */

import type {
  NormalizedActivity,
  ProviderMetric,
} from "@/modules/shared/activities/contracts";
import {
  ProviderPolicyViolationError,
  assertPolicy,
  isCrossProviderCombinationFlagEnabled,
} from "@/modules/shared/integrations/policy";
import type { ProviderId } from "@/modules/shared/integrations/types";

/**
 * Comparação de uma métrica entre providers, com proveniência preservada.
 *
 * Reúne os valores da MESMA métrica reportados por providers diferentes para a
 * mesma atividade, cada um embrulhado em `ProviderMetric<T>` (provider, id da
 * atividade no provider, momento da coleta). NÃO há merge: `divergent` apenas
 * sinaliza que os valores diferem além de uma tolerância, deixando a decisão
 * para uma camada superior (que hoje não existe / não é automática).
 *
 * _Requisitos: 16.2, 16.5, 7.8_
 */
export type MetricComparison<T = number> = {
  /** Nome da métrica comparada (ex.: `"distanceMeters"`, `"durationSeconds"`). */
  metric: string;
  /** Valores reportados por cada provider, com proveniência. */
  values: ProviderMetric<T>[];
  /**
   * Indica se os valores divergem além da tolerância aplicada. Puramente
   * informativo — não dispara nenhuma ação automática.
   */
  divergent: boolean;
};

/**
 * Candidato a correspondência entre uma atividade "primária" e uma atividade de
 * outro provider que pode representar o mesmo treino.
 *
 * É apenas um CANDIDATO: representa uma hipótese de correspondência com um grau
 * de confiança (`matchScore`), sem nunca combinar ou sobrescrever as
 * representações originais (Requisito 16.1, 16.2).
 *
 * _Requisitos: 16.1, 16.3_
 */
export type ActivityMatchCandidate = {
  /** Atividade do provider primário (referência). */
  primary: NormalizedActivity;
  /** Atividade do outro provider que pode ser a mesma sessão. */
  candidate: NormalizedActivity;
  /** Confiança da correspondência, em [0, 1] (1 = correspondência forte). */
  matchScore: number;
  /** Diferença absoluta entre os horários de início (segundos). */
  timeDeltaSeconds: number;
  /**
   * Comparações métricas entre as duas representações, com proveniência. Sempre
   * derivadas, nunca mescladas.
   */
  metricComparisons: MetricComparison[];
};

/** Entrada de `reconcileActivities`. */
export type ReconcileActivitiesInput = {
  /** Provider da lista primária. */
  primaryProvider: ProviderId;
  /** Provider da lista candidata (a comparar). */
  candidateProvider: ProviderId;
  /** Atividades normalizadas do provider primário. */
  primaryActivities: readonly NormalizedActivity[];
  /** Atividades normalizadas do provider candidato. */
  candidateActivities: readonly NormalizedActivity[];
  /**
   * Janela máxima (segundos) entre horários de início para considerar duas
   * atividades como candidatas à mesma sessão. Default: 5 minutos.
   */
  maxTimeDeltaSeconds?: number;
};

/** Resultado de `reconcileActivities`. */
export type ReconcileActivitiesResult = {
  /**
   * Indica se a reconciliação estava habilitada (flag + policy). Quando
   * `false`, as listas de candidatos/comparações são vazias (no-op).
   */
  enabled: boolean;
  /** Candidatos a correspondência encontrados (vazio quando desabilitada). */
  candidates: ActivityMatchCandidate[];
};

/** Janela default entre horários de início para candidatura (5 minutos). */
const DEFAULT_MAX_TIME_DELTA_SECONDS = 5 * 60;

/** Tolerâncias por métrica para sinalizar divergência (não dispara merge). */
const DISTANCE_TOLERANCE_METERS = 100;
const DURATION_TOLERANCE_SECONDS = 30;
const HEART_RATE_TOLERANCE_BPM = 3;

/**
 * Indica se a reconciliação entre dois providers está permitida.
 *
 * Aplica AMBAS as travas exigidas (Requisito 15.6, 16.x):
 *   1. o flag `STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED` (default `false`);
 *   2. o Policy Gate `assertPolicy(provider, "combine")` para os dois providers.
 *
 * Não lança: converte a violação de política em `false`, para que o chamador
 * simplesmente obtenha um no-op quando a combinação não é permitida.
 *
 * _Requisitos: 15.6, 16.3_
 */
export function isReconciliationAllowed(
  providers: readonly ProviderId[],
): boolean {
  // Trava explícita por flag de ambiente (default false). Redundante com o
  // Policy Gate abaixo (que também checa o flag), mas mantida explícita para
  // deixar claro o gating duplo exigido pela especificação.
  if (!isCrossProviderCombinationFlagEnabled()) {
    return false;
  }

  try {
    for (const provider of providers) {
      assertPolicy(provider, "combine");
    }
  } catch (error) {
    if (error instanceof ProviderPolicyViolationError) {
      return false;
    }

    throw error;
  }

  return true;
}

/**
 * Produz candidatos a correspondência entre atividades de dois providers, SEM
 * nunca mesclar ou persistir uma atividade combinada.
 *
 * Comportamento padrão (produção): retorna `{ enabled: false, candidates: [] }`
 * porque `STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED` é `false` e/ou a
 * política de combinação está desabilitada. Só quando ambas as travas estiverem
 * ligadas é que a função monta candidatos e comparações de métrica, deixando as
 * representações originais intactas (Requisito 16.1, 16.2, 16.5).
 *
 * Função pura: não faz I/O, não lê banco e não escreve nada.
 *
 * _Requisitos: 16.1, 16.2, 16.3, 16.4, 16.5, 15.6_
 */
export function reconcileActivities(
  input: ReconcileActivitiesInput,
): ReconcileActivitiesResult {
  // Gating obrigatório: flag + assertPolicy("combine"). Desabilitado por padrão.
  if (!isReconciliationAllowed([input.primaryProvider, input.candidateProvider])) {
    return { enabled: false, candidates: [] };
  }

  const maxDelta = input.maxTimeDeltaSeconds ?? DEFAULT_MAX_TIME_DELTA_SECONDS;
  const candidates: ActivityMatchCandidate[] = [];

  for (const primary of input.primaryActivities) {
    for (const candidate of input.candidateActivities) {
      // Só compara atividades do mesmo esporte canônico.
      if (primary.sportType !== candidate.sportType) {
        continue;
      }

      const timeDeltaSeconds = Math.abs(
        Math.round(
          (primary.startedAt.getTime() - candidate.startedAt.getTime()) / 1000,
        ),
      );

      if (timeDeltaSeconds > maxDelta) {
        continue;
      }

      candidates.push({
        primary,
        candidate,
        matchScore: computeMatchScore(timeDeltaSeconds, maxDelta),
        timeDeltaSeconds,
        metricComparisons: buildMetricComparisons(
          input.primaryProvider,
          primary,
          input.candidateProvider,
          candidate,
        ),
      });
    }
  }

  // Ordena por confiança decrescente para consumo previsível.
  candidates.sort((left, right) => right.matchScore - left.matchScore);

  return { enabled: true, candidates };
}

/** Confiança linear a partir da proximidade temporal (1 = mesmo instante). */
function computeMatchScore(timeDeltaSeconds: number, maxDelta: number): number {
  if (maxDelta <= 0) {
    return timeDeltaSeconds === 0 ? 1 : 0;
  }

  const score = 1 - timeDeltaSeconds / maxDelta;
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

/** Monta as comparações de métrica preservando a proveniência de cada lado. */
function buildMetricComparisons(
  primaryProvider: ProviderId,
  primary: NormalizedActivity,
  candidateProvider: ProviderId,
  candidate: NormalizedActivity,
): MetricComparison[] {
  const now = new Date();
  const comparisons: MetricComparison[] = [];

  const push = (
    metric: string,
    primaryValue: number | undefined,
    candidateValue: number | undefined,
    tolerance: number,
  ) => {
    const values: ProviderMetric<number>[] = [];

    if (primaryValue !== undefined) {
      values.push({
        value: primaryValue,
        provider: primaryProvider,
        providerActivityId: primary.externalId,
        collectedAt: now,
      });
    }

    if (candidateValue !== undefined) {
      values.push({
        value: candidateValue,
        provider: candidateProvider,
        providerActivityId: candidate.externalId,
        collectedAt: now,
      });
    }

    if (values.length === 0) {
      return;
    }

    const divergent =
      primaryValue !== undefined &&
      candidateValue !== undefined &&
      Math.abs(primaryValue - candidateValue) > tolerance;

    comparisons.push({ metric, values, divergent });
  };

  push("distanceMeters", primary.distanceMeters, candidate.distanceMeters, DISTANCE_TOLERANCE_METERS);
  push("durationSeconds", primary.durationSeconds, candidate.durationSeconds, DURATION_TOLERANCE_SECONDS);
  push("averageHeartRate", primary.averageHeartRate, candidate.averageHeartRate, HEART_RATE_TOLERANCE_BPM);

  return comparisons;
}
