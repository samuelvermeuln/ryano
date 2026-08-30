/**
 * Componentes de apresentação do módulo Strava (Task 8.2).
 *
 * - `StravaConnectButton`: botão "Conectar com Strava" que apenas navega até a
 *   rota de connect (o servidor faz o redirect OAuth). A UI não conhece OAuth
 *   (Req 13.8).
 * - `StravaConnectionManager`: tela de gerenciamento (status, scopes concedidos,
 *   desconectar) — Req 13.4.
 * - `StravaProviderCard`: card completo do Strava para o hub de Integrações,
 *   compondo os dois acima com visual consistente (Req 13.3, 13.7).
 *
 * _Requisitos: 13.3, 13.4, 13.7, 13.8_
 */

export { StravaConnectButton, STRAVA_CONNECT_ROUTE } from "./strava-connect-button";
export {
  StravaConnectionManager,
  STRAVA_DISCONNECT_ROUTE,
  type StravaDisconnectResult,
} from "./strava-connection-manager";
export {
  StravaProviderCard,
  type StravaCardNotice,
} from "./strava-provider-card";
