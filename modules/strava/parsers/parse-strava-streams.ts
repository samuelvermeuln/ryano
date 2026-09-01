/**
 * Parser de streams do Strava → estrutura interna (`ParsedActivityStream[]`).
 *
 * Mesma barreira aplicada em `parse-strava-activity.ts` (Req 9.3 / 11.4): o DTO
 * remoto validado (`StravaStreamSetObjectDto`, produzido por
 * `StravaClient.getActivityStreams` com `key_by_type=true`) **nunca** atravessa
 * direto para `modules/shared/**` ou para a UI — sempre passa por aqui e sai
 * como estrutura interna do módulo Strava.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Forma confirmada na doc oficial vigente do Strava
 * ([API Reference](https://developers.strava.com/docs/reference/), amostra de
 * `getActivityStreams`) e já refletida em `stravaStreamSetObjectSchema`:
 *   - a resposta com `key_by_type=true` é um objeto indexado pelo tipo de stream;
 *   - **nenhuma** chave é obrigatória — o conjunto devolvido depende dos `keys`
 *     pedidos e dos sensores que a atividade realmente possui;
 *   - cada stream numérico tem `data: number[]`, `series_type`
 *     (`"time" | "distance"`), `original_size` e `resolution`;
 *   - streams pedidos de uma mesma atividade compartilham comprimento/índice —
 *     o índice `i` de `heartrate` corresponde ao índice `i` de `time`.
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * Os streams não numéricos (`latlng`, pares de coordenadas, e `moving`,
 * booleano) ficam fora de `ParsedActivityStream`, cujo `values` é `number[]`.
 *
 * _Requisitos: 9.3_
 */

import type { HeartRateSample } from "@/modules/shared/activities/heart-rate-zones";
import type { StravaStreamSetObjectDto } from "@/modules/strava/api/dto/strava-stream";

/** Tipos de stream numérico convertidos para a estrutura interna. */
export const PARSED_ACTIVITY_STREAM_TYPES = [
  "time",
  "distance",
  "heartrate",
  "cadence",
  "watts",
  "velocity_smooth",
  "altitude",
  "grade_smooth",
  "temp",
] as const;

/** Tipo de stream numérico suportado pela estrutura interna. */
export type ParsedActivityStreamType =
  (typeof PARSED_ACTIVITY_STREAM_TYPES)[number];

/** Eixo de indexação do stream (`series_type` do Strava). */
export type ParsedActivityStreamSeriesType = "distance" | "time";

/**
 * Stream de atividade em forma interna: um por tipo presente na resposta,
 * preservando a ordem e os índices originais de `data`.
 */
export interface ParsedActivityStream {
  type: ParsedActivityStreamType;
  seriesType: ParsedActivityStreamSeriesType;
  values: number[];
}

/**
 * `series_type` é `nullish` no schema; quando ausente/desconhecido assume-se o
 * eixo temporal, que é o padrão da API para os streams que consumimos.
 */
const DEFAULT_SERIES_TYPE: ParsedActivityStreamSeriesType = "time";

function resolveSeriesType(value: unknown): ParsedActivityStreamSeriesType {
  return value === "distance" || value === "time" ? value : DEFAULT_SERIES_TYPE;
}

/**
 * Converte o `StreamSet` indexado por tipo em streams internos — uma entrada
 * por chave numérica presente no DTO, na ordem de `PARSED_ACTIVITY_STREAM_TYPES`.
 *
 * Função pura e tolerante: chaves ausentes são simplesmente ignoradas (nenhuma
 * é obrigatória) e os valores são copiados sem reordenar nem filtrar, de modo
 * que o índice de cada amostra continua comparável entre streams da mesma
 * resposta. Nunca lança.
 *
 * _Requisitos: 9.3_
 */
export function parseStravaStreams(
  dto: StravaStreamSetObjectDto,
): ParsedActivityStream[] {
  const streams: ParsedActivityStream[] = [];

  for (const type of PARSED_ACTIVITY_STREAM_TYPES) {
    const stream = dto[type];

    if (!stream || !Array.isArray(stream.data)) {
      continue;
    }

    streams.push({
      type,
      seriesType: resolveSeriesType(stream.series_type),
      values: [...stream.data],
    });
  }

  return streams;
}

/** Localiza um stream por tipo na lista já parseada. */
function findStream(
  streams: readonly ParsedActivityStream[],
  type: ParsedActivityStreamType,
): ParsedActivityStream | undefined {
  return streams.find((stream) => stream.type === type);
}

/**
 * Extrai a série de FC como `HeartRateSample[]`, pareando o stream `heartrate`
 * com o stream `time` da mesma resposta (mesmo índice = mesmo instante).
 *
 * Quando o stream `time` não vem na resposta — não deveria ocorrer se `time` é
 * pedido junto de `heartrate`, mas é defensivo — assume-se amostragem uniforme
 * sintética derivada do índice (1 amostra/segundo), para que o cálculo de zonas
 * nunca falhe por ausência do eixo temporal explícito. O mesmo vale para
 * instantes individualmente não finitos.
 *
 * Retorna `null` quando não há stream de FC (ou ele não tem nenhuma amostra
 * utilizável): ausência de dado, tratada pelo chamador como omissão graciosa.
 * Amostras com `bpm` não finito são descartadas. Nunca lança.
 *
 * _Requisitos: 9.3_
 */
export function toHeartRateSamples(
  streams: readonly ParsedActivityStream[],
): HeartRateSample[] | null {
  const heartRate = findStream(streams, "heartrate");

  if (!heartRate) {
    return null;
  }

  const time = findStream(streams, "time");
  const samples: HeartRateSample[] = [];

  heartRate.values.forEach((bpm, index) => {
    if (!Number.isFinite(bpm)) {
      return;
    }

    const timeSeconds = time?.values[index];

    samples.push({
      timeSeconds:
        typeof timeSeconds === "number" && Number.isFinite(timeSeconds)
          ? timeSeconds
          : index,
      bpm,
    });
  });

  return samples.length > 0 ? samples : null;
}
