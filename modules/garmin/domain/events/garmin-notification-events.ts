/**
 * Eventos de notificação do Garmin (domínio).
 *
 * Movido de `server/services/garmin-notification-events.ts` na tarefa 2.3.
 * Mantido verbatim para preservar o comportamento observável (movimento
 * estrutural — Requisito 5.6). Um shim permanece no caminho antigo até a
 * religação da tarefa 2.5.
 *
 * _Requisitos: 5.1, 5.2_
 */

export const GARMIN_RECONNECT_NOTIFICATION_SENT_EVENT = "GARMIN_RECONNECT_NOTIFICATION_SENT";
export const GARMIN_RECONNECT_NOTIFICATION_FAILED_EVENT = "GARMIN_RECONNECT_NOTIFICATION_FAILED";
