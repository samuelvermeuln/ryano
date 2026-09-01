import { formatDuration } from "@/lib/format";
import type { ActivityBarSection } from "@/modules/shared/activities/presentation/activity-visual-data";

/**
 * Cálculo compartilhado de zonas de frequência cardíaca a partir de uma série
 * temporal de FC (stream), por percentual da FC máxima de referência
 * (Requisitos 2.3, 2.6, 2.7 e 10.3 do spec `detalhe-atividade-multi-provider`).
 *
 * Este módulo é puro: sem I/O, sem `@prisma/client`, sem import de nenhum
 * módulo de provider. Qualquer provider com stream de FC (Strava hoje; Polar,
 * COROS, Suunto, Fitbit no futuro) reutiliza esta mesma conta — o módulo do
 * provider decide *se* chama o cálculo; este core só sabe fazer a conta.
 */

/** Amostra de FC ao longo do tempo (a unidade de "time" é segundos desde o início). */
export interface HeartRateSample {
  timeSeconds: number;
  bpm: number;
}

/** As 5 faixas de %FCmáx usadas para zonas calculadas (limites inferiores, inclusive). */
export const HEART_RATE_ZONE_PERCENT_BOUNDARIES = [0, 0.6, 0.7, 0.8, 0.9] as const;

/** Rótulos exibidos para cada uma das 5 faixas, na mesma ordem dos limites. */
export const HEART_RATE_ZONE_LABELS = [
  "Zona 1 · Recuperação",
  "Zona 2 · Leve",
  "Zona 3 · Moderada",
  "Zona 4 · Intensa",
  "Zona 5 · Máxima",
] as const;

/** Quantidade fixa de faixas produzidas pelo cálculo. */
export const HEART_RATE_ZONE_COUNT = HEART_RATE_ZONE_PERCENT_BOUNDARIES.length;

/** `id` da seção de barras produzida por este cálculo. */
export const HEART_RATE_ZONES_SECTION_ID = "heart-rate-zones";

/** Paleta das barras das zonas (mesma escala visual usada nas zonas nativas). */
const HEART_RATE_ZONE_COLORS = [
  "linear-gradient(90deg,#38bdf8,#67e8f9)",
  "linear-gradient(90deg,#34d399,#6ee7b7)",
  "linear-gradient(90deg,#f59e0b,#fbbf24)",
  "linear-gradient(90deg,#fb7185,#f97316)",
  "linear-gradient(90deg,#a78bfa,#f472b6)",
] as const;

/** Normaliza o instante de uma amostra: valores não finitos contam como `0`. */
function normalizeTimeSeconds(timeSeconds: number): number {
  return Number.isFinite(timeSeconds) ? timeSeconds : 0;
}

/**
 * Resolve o índice (0..4) da faixa de uma amostra por `%FCmáx`, usando os
 * limites inferiores inclusivos de `HEART_RATE_ZONE_PERCENT_BOUNDARIES`.
 * Valores inválidos ou abaixo do primeiro limite caem na primeira faixa.
 */
function resolveZoneIndex(bpm: number, maxHeartRateReference: number): number {
  const percent = bpm / maxHeartRateReference;

  if (!Number.isFinite(percent)) {
    return 0;
  }

  for (let index = HEART_RATE_ZONE_PERCENT_BOUNDARIES.length - 1; index > 0; index -= 1) {
    if (percent >= HEART_RATE_ZONE_PERCENT_BOUNDARIES[index]) {
      return index;
    }
  }

  return 0;
}

/**
 * Calcula as 5 zonas de %FCmáx a partir de uma série de FC, atribuindo o tempo
 * entre amostras consecutivas à zona da amostra anterior (integração por
 * retângulos). A série é ordenada por instante antes da integração, de modo que
 * a soma dos tempos das 5 faixas é sempre igual ao intervalo total coberto pela
 * série (`último instante - primeiro instante`).
 *
 * Pura e determinística (Requisito 10.3): mesma entrada, mesma saída, sem I/O e
 * sem mutar a série recebida. Nunca lança.
 *
 * Retorna `null` quando `samples` está vazio ou `maxHeartRateReference` não é um
 * número positivo finito (dado insuficiente para o cálculo — o chamador trata
 * como ausência de dado e simplesmente não exibe a seção, Requisito 2.6).
 */
export function computeHeartRateZonesFromStream(
  samples: readonly HeartRateSample[],
  maxHeartRateReference: number,
): ActivityBarSection | null {
  if (samples.length === 0) {
    return null;
  }

  if (!Number.isFinite(maxHeartRateReference) || maxHeartRateReference <= 0) {
    return null;
  }

  const ordered = samples
    .map((sample) => ({
      timeSeconds: normalizeTimeSeconds(sample.timeSeconds),
      bpm: sample.bpm,
    }))
    .sort((left, right) => left.timeSeconds - right.timeSeconds);

  const secondsByZone = new Array<number>(HEART_RATE_ZONE_COUNT).fill(0);

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    const elapsedSeconds = Math.max(0, next.timeSeconds - current.timeSeconds);

    if (elapsedSeconds === 0) {
      continue;
    }

    const zoneIndex = resolveZoneIndex(current.bpm, maxHeartRateReference);
    secondsByZone[zoneIndex] += elapsedSeconds;
  }

  const totalSeconds = secondsByZone.reduce((total, seconds) => total + seconds, 0);

  return {
    id: HEART_RATE_ZONES_SECTION_ID,
    title: "Zonas de frequência cardíaca",
    description:
      "Tempo em cada zona calculado pela Ryvano a partir da série de frequência cardíaca da atividade, por percentual da FC máxima de referência.",
    approximate: true,
    items: HEART_RATE_ZONE_LABELS.map((label, index) => {
      const seconds = secondsByZone[index] ?? 0;
      const ratio = totalSeconds > 0 ? seconds / totalSeconds : 0;

      return {
        label,
        valueText: `${formatDuration(seconds)} · ${Math.round(ratio * 100)}%`,
        ratio,
        color: HEART_RATE_ZONE_COLORS[index] ?? HEART_RATE_ZONE_COLORS[0],
      };
    }),
  };
}
