/**
 * Tipos de apresentação canônicos do detalhe de atividade (provider-agnostic).
 *
 * Estes tipos formam o contrato visual consumido pela tela de detalhe de
 * atividade (`components/activities/activity-visual-dashboard.tsx`),
 * independentemente do provider de origem. A visão base é montada a partir dos
 * campos normalizados de `Activity` (canônicos após a Fase 3) e pode ser
 * enriquecida pelo módulo do provider quando a capability existir — nunca
 * dependendo de um provider específico.
 *
 * O módulo Garmin reexporta estes mesmos tipos (`GarminActivityVisualData`
 * estende `ActivityVisualData`), de modo que o dado enriquecido do Garmin é
 * estruturalmente compatível com a visão base.
 *
 * _Requisitos: 7.6, 7.7_
 */

/** Estatística de destaque exibida no herói do detalhe de atividade. */
export type ActivityHeroStat = {
  label: string;
  value: string;
  tone: string;
};

/** Linha simples rótulo/valor de uma seção de métricas. */
export type ActivityMetricRow = {
  label: string;
  value: string;
};

/** Seção de barras (zonas, splits) com itens proporcionais. */
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

/** Seção de métricas agrupadas (leituras adicionais). */
export type ActivityMetricSection = {
  id: string;
  title: string;
  description: string;
  metrics: ActivityMetricRow[];
};

/**
 * Visão de dados de uma atividade, provider-agnostic.
 *
 * `provider` preserva a origem (para badge/label). As seções de barras e de
 * métricas adicionais podem vir vazias na visão base — só são preenchidas
 * quando o módulo do provider enriquece o detalhe.
 */
export type ActivityVisualData = {
  sportLabel: string;
  sportKey: string;
  provider: string;
  startedAtLabel: string;
  heroStats: ActivityHeroStat[];
  overviewMetrics: ActivityMetricRow[];
  barSections: ActivityBarSection[];
  metricSections: ActivityMetricSection[];
};
