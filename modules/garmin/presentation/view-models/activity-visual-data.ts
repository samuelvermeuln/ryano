/**
 * View-models de visualização de atividade do Garmin (presentation).
 *
 * Extraído de `server/services/garmin-activity-details.ts` na tarefa 2.3. A
 * lógica de montagem (application) vive em
 * `modules/garmin/application/activities/garmin-activity-details.ts`.
 *
 * Os tipos de apresentação são **reexportados** do core provider-agnostic
 * (`modules/shared/activities/presentation/activity-visual-data`), que é a
 * única fonte de verdade do contrato visual. Assim, campos opcionais novos do
 * core (ex.: `approximate`/`disclaimer` em `ActivityBarSection`, tarefa 8.1)
 * chegam aqui automaticamente, sem edição neste módulo e sem mudança de
 * comportamento do Garmin — `getGarminActivityVisualData` simplesmente não
 * preenche esses campos.
 *
 * _Requisitos: 5.1, 5.2, 2.5_
 */

import type { ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";

export type {
  ActivityBarSection,
  ActivityHeroStat,
  ActivityMetricRow,
  ActivityMetricSection,
} from "@/modules/shared/activities/presentation/activity-visual-data";

/**
 * Visão de dados de atividade do Garmin.
 *
 * Estruturalmente idêntica à visão base `ActivityVisualData` — o Garmin
 * enriquece o conteúdo das seções, não a forma do contrato.
 */
export type GarminActivityVisualData = ActivityVisualData;
