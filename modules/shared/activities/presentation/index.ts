/**
 * Barrel da camada de apresentação de atividades (provider-agnostic).
 *
 * _Requisitos: 7.6, 7.7_
 */

export type {
  ActivityBarSection,
  ActivityHeroStat,
  ActivityMetricRow,
  ActivityMetricSection,
  ActivityVisualData,
} from "@/modules/shared/activities/presentation/activity-visual-data";

export {
  buildBaseActivityVisualData,
  getActivityVisualData,
} from "@/modules/shared/activities/presentation/get-activity-visual-data";
