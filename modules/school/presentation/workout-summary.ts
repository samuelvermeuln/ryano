/**
 * SAM-5 — resumo de uma prescrição a partir dos blocos, para o modal de treino.
 *
 * Puro e sem diretiva: roda no servidor (onde os payloads brutos existem) e o
 * resultado já formatado atravessa a fronteira para o Client Component.
 * Nada aqui inventa dado: campos ausentes na prescrição simplesmente não
 * aparecem no resumo.
 */
import { describeBlockTargets } from "./workout-blocks";

export interface SummarizableBlock {
  blockType: string;
  durationS: number | null;
  distanceM: number | null;
  repetitions: number | null;
  targetPayload: unknown;
  restPayload: unknown;
}

export interface WorkoutSummary {
  /** Σ repetições × (duração + descanso) — só blocos com duração entram. */
  estimatedDurationSeconds: number | null;
  /** Σ repetições × distância — só blocos com distância entram. */
  plannedDistanceMeters: number | null;
  /** Alvos de intensidade distintos, na ordem em que aparecem (ritmo, FC, zona, RPE…). */
  intensityTargets: string[];
  /** Há bloco de intervalo repetido, zona ≥ 4 ou RPE ≥ 8. */
  highIntensity: boolean;
}

function numberField(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

export function restDurationSeconds(restPayload: unknown): number | null {
  return numberField(restPayload, "durationS");
}

export function summarizeWorkoutBlocks(blocks: readonly SummarizableBlock[] | null): WorkoutSummary {
  if (!blocks || blocks.length === 0) {
    return { estimatedDurationSeconds: null, plannedDistanceMeters: null, intensityTargets: [], highIntensity: false };
  }

  let duration = 0;
  let distance = 0;
  let hasDuration = false;
  let hasDistance = false;
  const targets = new Set<string>();
  let highIntensity = false;

  for (const block of blocks) {
    const reps = block.repetitions && block.repetitions > 0 ? block.repetitions : 1;
    const rest = restDurationSeconds(block.restPayload) ?? 0;

    if (block.durationS != null) {
      hasDuration = true;
      // O descanso do último rep normalmente não existe; a estimativa é conservadora (inclui todos).
      duration += reps * (block.durationS + rest);
    }
    if (block.distanceM != null) {
      hasDistance = true;
      distance += reps * block.distanceM;
    }
    for (const line of describeBlockTargets(block.targetPayload)) targets.add(line);

    const zone = numberField(block.targetPayload, "zone");
    const rpe = numberField(block.targetPayload, "rpe");
    if ((block.blockType === "INTERVAL" && reps > 1) || (zone != null && zone >= 4) || (rpe != null && rpe >= 8)) {
      highIntensity = true;
    }
  }

  return {
    estimatedDurationSeconds: hasDuration ? Math.round(duration) : null,
    plannedDistanceMeters: hasDistance ? Math.round(distance) : null,
    intensityTargets: [...targets],
    highIntensity,
  };
}
