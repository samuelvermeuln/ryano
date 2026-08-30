/**
 * View-models de visualização de atividade do Garmin (presentation).
 *
 * Extraído de `server/services/garmin-activity-details.ts` na tarefa 2.3. Os
 * tipos de apresentação vivem aqui; a lógica de montagem (application) vive em
 * `modules/garmin/application/activities/garmin-activity-details.ts`. Movimento
 * estrutural, sem mudança de contrato (Requisito 5.6). Um shim permanece no
 * caminho antigo (`server/services/garmin-activity-details.ts`) até a religação
 * da tarefa 2.5.
 *
 * _Requisitos: 5.1, 5.2_
 */

export type ActivityHeroStat = {
  label: string;
  value: string;
  tone: string;
};

export type ActivityMetricRow = {
  label: string;
  value: string;
};

export type ActivityBarSection = {
  id: string;
  title: string;
  description: string;
  items: Array<{
    label: string;
    valueText: string;
    ratio: number;
    color: string;
  }>;
};

export type ActivityMetricSection = {
  id: string;
  title: string;
  description: string;
  metrics: ActivityMetricRow[];
};

export type GarminActivityVisualData = {
  sportLabel: string;
  sportKey: string;
  provider: string;
  startedAtLabel: string;
  heroStats: ActivityHeroStat[];
  overviewMetrics: ActivityMetricRow[];
  barSections: ActivityBarSection[];
  metricSections: ActivityMetricSection[];
};
