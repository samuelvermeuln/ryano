/**
 * Barrel de application/activities do módulo Garmin.
 *
 * _Requisitos: 5.1, 5.2_
 */

export { getGarminActivityVisualData } from "@/modules/garmin/application/activities/garmin-activity-details";
export type {
  ActivityBarSection,
  ActivityHeroStat,
  ActivityMetricRow,
  ActivityMetricSection,
  GarminActivityVisualData,
} from "@/modules/garmin/presentation/view-models/activity-visual-data";
