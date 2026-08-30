/**
 * Parser de atividade do Strava → `NormalizedActivity`.
 *
 * Converte um DTO remoto do Strava (`StravaSummaryActivityDto` de listagem/
 * backfill ou `StravaDetailedActivityDto` de `GET /activities/{id}`) para o
 * contrato canônico `NormalizedActivity`, provider-agnostic. Esta é a barreira
 * exigida pelo Requisito 11.4: o DTO remoto **nunca** atravessa direto para o
 * domínio/UI — sempre passa por este parser.
 *
 * O tipo de esporte é mapeado para `RyvanoSportType` via `parseStravaSportType`,
 * preferindo `sport_type` (campo canônico atual do Strava) sobre `type` (legado);
 * o valor bruto original é preservado em `providerSportType` (Req 7.5).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Unidades (confirmadas na doc oficial vigente do Strava —
 * [API Reference](https://developers.strava.com/docs/reference/), campos de
 * `SummaryActivity`/`DetailedActivity`), que já coincidem com o contrato
 * `NormalizedActivity`:
 *   - `distance` → metros            → `distanceMeters`
 *   - `elapsed_time` → segundos      → `durationSeconds`
 *   - `moving_time` → segundos       → `movingSeconds`
 *   - `average_speed`/`max_speed` → metros por segundo → `averageSpeed`/`maxSpeed`
 *   - `total_elevation_gain` → metros → `elevationGain`
 *   - `average_heartrate`/`max_heartrate` → bpm → `averageHeartRate`/`maxHeartRate`
 *   - `average_cadence` → (RPM/passos por minuto) → `averageCadence`
 *   - `average_watts`/`max_watts` → watts → `averagePower`/`maxPower`
 *   - `start_date` → ISO 8601 (UTC) → `startedAt` (`new Date(...)`)
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * Robustez: todos os campos de métrica são opcionais no DTO (podem vir `null`
 * ou ausentes — ex.: atividades manuais sem HR/potência). São convertidos para
 * `undefined` (nunca `null`) conforme o contrato compartilhado. Só `id` e
 * `start_date` são tratados como base necessária.
 *
 * _Requisitos: 11.4, 7.1, 7.4, 7.5_
 */

import type { NormalizedActivity } from "@/modules/shared/activities/contracts";
import type {
  StravaDetailedActivityDto,
  StravaSummaryActivityDto,
} from "@/modules/strava/api/dto/strava-activity";
import { parseStravaSportType } from "@/modules/strava/parsers/parse-strava-sport-type";

/** DTO aceito pelo parser: resumo (listagem) ou detalhe (`GET /activities/{id}`). */
export type StravaActivityDto =
  | StravaSummaryActivityDto
  | StravaDetailedActivityDto;

/**
 * Converte um valor possivelmente `null`/`undefined`/não-finito em `number`
 * finito ou `undefined` (nunca `null`), conforme o contrato compartilhado.
 */
function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Converte a `start_date` (ISO 8601) em `Date`. Tolerante a valores inválidos:
 * cai para o instante atual em vez de produzir uma data inválida.
 */
function parseStartedAt(startDate: string): Date {
  const date = new Date(startDate);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/**
 * Resolve o sport type bruto do Strava, preferindo `sport_type` (canônico) sobre
 * `type` (legado). Retorna uma string não-vazia para preservação em
 * `providerSportType`; quando nenhum dos dois está presente, usa o valor
 * genérico `"Workout"` (sport type genérico do próprio Strava).
 */
function resolveProviderSportType(dto: StravaActivityDto): string {
  const sportType = typeof dto.sport_type === "string" ? dto.sport_type.trim() : "";
  if (sportType) {
    return sportType;
  }

  const legacyType = typeof dto.type === "string" ? dto.type.trim() : "";
  if (legacyType) {
    return legacyType;
  }

  return "Workout";
}

/**
 * Produz a `NormalizedActivity` canônica a partir de um DTO de atividade do
 * Strava.
 *
 * `source = "STRAVA"`, `externalId = String(id)`, `sportType` via
 * `parseStravaSportType(sport_type ?? type)`, `providerSportType` preservando o
 * valor bruto. Campos de métrica ausentes ficam `undefined`. O DTO cru é
 * preservado em `raw` para detalhe/enriquecimento.
 *
 * _Requisitos: 11.4, 7.1, 7.4, 7.5_
 */
export function parseStravaActivity(dto: StravaActivityDto): NormalizedActivity {
  const providerSportType = resolveProviderSportType(dto);

  return {
    source: "STRAVA",
    externalId: String(dto.id),
    sportType: parseStravaSportType(providerSportType),
    providerSportType,
    startedAt: parseStartedAt(dto.start_date),
    durationSeconds: numberOrUndefined(dto.elapsed_time),
    movingSeconds: numberOrUndefined(dto.moving_time),
    distanceMeters: numberOrUndefined(dto.distance),
    averageHeartRate: numberOrUndefined(dto.average_heartrate),
    maxHeartRate: numberOrUndefined(dto.max_heartrate),
    averageSpeed: numberOrUndefined(dto.average_speed),
    maxSpeed: numberOrUndefined(dto.max_speed),
    elevationGain: numberOrUndefined(dto.total_elevation_gain),
    averageCadence: numberOrUndefined(dto.average_cadence),
    averagePower: numberOrUndefined(dto.average_watts),
    maxPower: numberOrUndefined(dto.max_watts),
    raw: dto as Record<string, unknown>,
  };
}
