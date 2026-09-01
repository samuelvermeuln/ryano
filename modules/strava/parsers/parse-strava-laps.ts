/**
 * Parser de laps/splits do Strava → estrutura interna (`ParsedActivityLap[]`).
 *
 * Mesma barreira aplicada em `parse-strava-activity.ts` e
 * `parse-strava-streams.ts` (Req 9.3 / 11.4): o DTO remoto validado
 * (`StravaLapDto[]`, produzido por `StravaClient.getActivityLaps` via
 * `stravaLapListSchema`) **nunca** atravessa direto para `modules/shared/**` ou
 * para a UI — sempre passa por aqui e sai como estrutura interna do módulo
 * Strava.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Forma e unidades confirmadas na doc oficial vigente do Strava
 * ([API Reference](https://developers.strava.com/docs/reference/), amostra de
 * `getLapsByActivityId`) e já refletidas em `stravaLapSchema`:
 *   - `elapsed_time`/`moving_time` → segundos;
 *   - `distance` → metros;
 *   - `average_speed`/`max_speed` → metros por segundo;
 *   - `average_heartrate`/`max_heartrate` → bpm;
 *   - `average_cadence` → RPM (ou passos por minuto na corrida);
 *   - `average_watts` → watts, com `device_watts` indicando se vem de medidor
 *     real ou de estimativa — a distinção medido vs. estimado é decisão de
 *     apresentação, então o valor é preservado como veio e `device_watts` não
 *     filtra nada aqui;
 *   - `lap_index` é 1-based e `split` numera os splits automáticos; ambos são
 *     `nullish` no schema, pois só `id` é garantido.
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * _Requisitos: 9.3_
 */

import type { StravaLapDto } from "@/modules/strava/api/dto/strava-lap";

/**
 * Lap/split de atividade em forma interna. Métricas dependentes de sensor são
 * `number | null` (nunca `undefined`) — estas estruturas são internas ao módulo
 * Strava e não precisam casar com `NormalizedActivity`, que usa `undefined`.
 */
export interface ParsedActivityLap {
  /** `lap_index` (1-based) quando presente; senão `split`; senão a posição no array. */
  index: number;
  /** `elapsed_time` em segundos. */
  durationSeconds: number | null;
  /** `distance` em metros. */
  distanceMeters: number | null;
  /** `average_heartrate` em bpm. */
  averageHeartRate: number | null;
  /** `average_cadence` em RPM (passos por minuto na corrida). */
  averageCadence: number | null;
  /** `average_speed` em metros por segundo. */
  averageSpeed: number | null;
  /** `average_watts` em watts (medido ou estimado, conforme `device_watts`). */
  averageWatts: number | null;
}

/**
 * Converte um valor possivelmente `null`/`undefined`/não-finito em `number`
 * finito ou `null`, conforme o contrato interno acima.
 */
function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Resolve o índice do lap: `lap_index` (1-based na API) tem precedência, com
 * fallback para `split` e, por fim, para a posição no array (também 1-based,
 * para não misturar bases quando alguns laps têm `lap_index` e outros não).
 */
function resolveIndex(dto: StravaLapDto, position: number): number {
  return (
    numberOrNull(dto.lap_index) ?? numberOrNull(dto.split) ?? position + 1
  );
}

/**
 * Converte a lista de laps do Strava em laps internos, ordenados por
 * `lap_index`/`split` (via `index` resolvido), com a posição original como
 * critério de desempate — a ordenação é estável e determinística mesmo quando
 * vários laps compartilham o mesmo índice ou não trazem nenhum.
 *
 * Função pura e tolerante: não muta a entrada, não filtra laps (a lista de
 * saída tem sempre o mesmo tamanho da entrada) e nunca lança — métricas
 * ausentes, nulas ou não finitas viram `null`.
 *
 * _Requisitos: 9.3_
 */
export function parseStravaLaps(dtos: StravaLapDto[]): ParsedActivityLap[] {
  return dtos
    .map((dto, position) => ({
      position,
      lap: {
        index: resolveIndex(dto, position),
        durationSeconds: numberOrNull(dto.elapsed_time),
        distanceMeters: numberOrNull(dto.distance),
        averageHeartRate: numberOrNull(dto.average_heartrate),
        averageCadence: numberOrNull(dto.average_cadence),
        averageSpeed: numberOrNull(dto.average_speed),
        averageWatts: numberOrNull(dto.average_watts),
      } satisfies ParsedActivityLap,
    }))
    .sort((a, b) => a.lap.index - b.lap.index || a.position - b.position)
    .map((entry) => entry.lap);
}
