/**
 * Concern de notificações de reconexão do Garmin (application/notifications).
 *
 * Reexporta a parte de "notifications" do serviço canônico
 * (`modules/garmin/application/garmin-service.ts`). Comportamento preservado
 * (Requisito 5.6).
 *
 * _Requisitos: 5.1, 5.2_
 */

export {
  GARMIN_RECONNECT_NOTIFICATION_COOLDOWN_MS,
  getGarminReconnectNotificationCooldown,
  getLatestGarminReconnectNotification,
  sendGarminReconnectNotification,
} from "@/modules/garmin/application/garmin-service";
export type { GarminReconnectNotificationSummary } from "@/modules/garmin/application/garmin-service";
