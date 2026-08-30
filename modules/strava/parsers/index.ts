/**
 * Barrel dos parsers do Strava (Task 6.2).
 *
 * Os parsers são a barreira entre o "wire shape" do Strava (DTOs remotos
 * validados em `api/schemas`/`api/dto`) e os contratos internos da Ryvano: o DTO
 * remoto NUNCA atravessa direto para o domínio/UI (Req 11.4). Todos são funções
 * puras, sem rede, unit-testáveis (testes na Task 6.5).
 *
 * _Requisitos: 11.4, 7.1, 7.4, 7.5_
 */

export { parseStravaActivity } from "@/modules/strava/parsers/parse-strava-activity";
export type { StravaActivityDto } from "@/modules/strava/parsers/parse-strava-activity";

export { parseStravaSportType } from "@/modules/strava/parsers/parse-strava-sport-type";

export {
  normalizeStravaScopes,
  parseStravaTokenResponse,
  stravaTokenAthleteSchema,
  stravaTokenResponseSchema,
  StravaTokenResponseParseError,
} from "@/modules/strava/parsers/parse-strava-token-response";
export type {
  ParsedStravaTokenResponse,
  ParseStravaTokenResponseOptions,
  StravaTokenResponse,
} from "@/modules/strava/parsers/parse-strava-token-response";
