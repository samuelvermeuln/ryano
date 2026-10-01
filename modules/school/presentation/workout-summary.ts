/**
 * SAM-5 — resumo de uma prescrição a partir dos blocos, para o modal de treino.
 *
 * Puro e sem diretiva: roda no servidor (onde os payloads brutos existem) e o
 * resultado já formatado atravessa a fronteira para o Client Component.
 * Nada aqui inventa dado: campos ausentes na prescrição simplesmente não
 * aparecem no resumo.
 */
import { numberField, plannedTotals, repetitionsOf, type StructuredBlock } from "../domain/workout-structure";
import { describeBlockTargets } from "./workout-blocks";

export type SummarizableBlock = StructuredBlock;

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

export { restDurationSeconds } from "../domain/workout-structure";

export function summarizeWorkoutBlocks(blocks: readonly SummarizableBlock[] | null): WorkoutSummary {
  if (!blocks || blocks.length === 0) {
    return { estimatedDurationSeconds: null, plannedDistanceMeters: null, intensityTargets: [], highIntensity: false };
  }

  // SAM-19 — the same totals compliance scores against (domain/workout-structure.ts).
  const totals = plannedTotals(blocks);
  const targets = new Set<string>();
  let highIntensity = false;

  for (const block of blocks) {
    const reps = repetitionsOf(block);
    for (const line of describeBlockTargets(block.targetPayload)) targets.add(line);

    const zone = numberField(block.targetPayload, "zone");
    const rpe = numberField(block.targetPayload, "rpe");
    if ((block.blockType === "INTERVAL" && reps > 1) || (zone != null && zone >= 4) || (rpe != null && rpe >= 8)) {
      highIntensity = true;
    }
  }

  return {
    estimatedDurationSeconds: totals.durationSeconds,
    plannedDistanceMeters: totals.distanceMeters,
    intensityTargets: [...targets],
    highIntensity,
  };
}
