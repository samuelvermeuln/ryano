/**
 * Contrato canônico de atividade normalizada e proveniência de métrica.
 *
 * `NormalizedActivity` é a **fonte única** do formato de atividade da Ryvano,
 * provider-agnostic: toda atividade importada de qualquer provider (Garmin,
 * Strava, ...) é convertida para este formato por um
 * `normalize<Provider>Activity(raw): NormalizedActivity`. Nenhuma propriedade
 * específica de um provider é obrigatória aqui (Requisito 7.2); campos crus do
 * provider ficam em `raw` para detalhe/enriquecimento.
 *
 * O tipo de esporte é sempre canônico (`RyvanoSportType`), enquanto o valor
 * original do provider é preservado em `providerSportType`, permitindo corrigir
 * mapeamentos no futuro sem perder o dado de origem (Requisito 7.5).
 *
 * `ProviderMetric<T>` carrega a proveniência de uma métrica (provider, id da
 * atividade no provider, momento da coleta) para o caso de comparação entre
 * providers — **não** há merge automático de métricas entre providers
 * (Requisito 7.8).
 *
 * _Requisitos: 7.1, 7.2, 7.8_
 */

import type { RyvanoSportType } from "@/modules/shared/activities/sport-types";
import type { ProviderId } from "@/modules/shared/integrations/types";

/**
 * Provider de origem de uma atividade normalizada.
 *
 * Alias de `ProviderId`: a origem de uma atividade é sempre um provider
 * suportado pela Ryvano.
 */
export type ActivitySource = ProviderId;

/**
 * Atividade em formato canônico, provider-agnostic.
 *
 * Preserva a origem (`source`) e o tipo de esporte original do provider
 * (`providerSportType`) além do tipo canônico (`sportType`). Todos os campos de
 * métrica são opcionais: um provider fornece apenas os que expõe, sem que
 * nenhum campo específico de provider seja obrigatório no contrato compartilhado.
 *
 * _Requisitos: 7.1, 7.2_
 */
export type NormalizedActivity = {
  /** Provider de origem da atividade. */
  source: ActivitySource;
  /** Identificador da atividade no provider de origem. */
  externalId: string;
  /** Tipo de esporte canônico da Ryvano. */
  sportType: RyvanoSportType;
  /** Tipo de esporte original do provider, preservado para reprocessamento. */
  providerSportType: string;
  /** Início da atividade. */
  startedAt: Date;
  /** Duração total (segundos). */
  durationSeconds?: number;
  /** Tempo em movimento (segundos). */
  movingSeconds?: number;
  /** Distância percorrida (metros). */
  distanceMeters?: number;
  /** Frequência cardíaca média (bpm). */
  averageHeartRate?: number;
  /** Frequência cardíaca máxima (bpm). */
  maxHeartRate?: number;
  /** Velocidade média (m/s). */
  averageSpeed?: number;
  /** Velocidade máxima (m/s). */
  maxSpeed?: number;
  /** Ganho de elevação (metros). */
  elevationGain?: number;
  /** Cadência média. */
  averageCadence?: number;
  /** Potência média (watts). */
  averagePower?: number;
  /** Potência máxima (watts). */
  maxPower?: number;
  /** Payload cru específico do provider (para detalhe/enriquecimento). */
  raw?: Record<string, unknown>;
};

/**
 * Métrica com proveniência preservada.
 *
 * Envolve um valor de métrica (`value`) com a origem exata de onde ele veio:
 * qual provider, qual atividade no provider e quando foi coletado. Isso permite
 * que dois providers registrem valores diferentes para o mesmo treino sem
 * sobrescrita silenciosa; a decisão de qual usar (ou de comparar) fica a cargo
 * da camada de reconciliação, que **não** faz merge automático.
 *
 * _Requisitos: 7.8_
 */
export type ProviderMetric<T> = {
  /** Valor da métrica. */
  value: T;
  /** Provider que forneceu esta métrica. */
  provider: ProviderId;
  /** Id da atividade no provider de origem. */
  providerActivityId: string;
  /** Momento em que a métrica foi coletada. */
  collectedAt: Date;
};
