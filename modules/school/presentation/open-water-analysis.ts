/**
 * SAM-65 — what an open-water session can honestly say (§13.9, §22.1).
 *
 * - Distance from a watch in open water is an estimate; when it is missing
 *   or physically incoherent for swimming, the screen says so and computes
 *   no pace, let alone "melhorou".
 * - Two sessions are comparable only with the same environment, course and
 *   conditions; otherwise: "tempo menor em condições diferentes — comparação
 *   limitada". A favourable current is never read as physiological progress.
 * - The technical task stays "pendente de revisão" until the coach reviews.
 */
import type { Condition, OpenWaterFeedback, OpenWaterSession } from "../domain/open-water-session";

/**
 * Above this mean speed a swim recording is incoherent (GPS jumps, wrong sport
 * on the watch); below the lower one it is mostly stopped time. Stated in the
 * label so the coach sees the rule, not a verdict.
 */
export const SWIM_SPEED_MAX_MPS = 2.2;
export const SWIM_SPEED_MIN_MPS = 0.15;

export type GpsQuality =
  | { status: "NO_DISTANCE"; label: string }
  | { status: "INCOHERENT"; label: string }
  | { status: "ESTIMATE"; label: string; pacePer100mSeconds: number };

export function gpsQuality(realized: { durationSeconds: number | null; distanceMeters: number | null } | null): GpsQuality | null {
  if (!realized || !realized.durationSeconds) return null;
  if (!realized.distanceMeters) return { status: "NO_DISTANCE", label: "Sem distância registrada — a sessão é lida pelo tempo." };
  const speed = realized.distanceMeters / realized.durationSeconds;
  if (speed > SWIM_SPEED_MAX_MPS || speed < SWIM_SPEED_MIN_MPS) {
    return {
      status: "INCOHERENT",
      label: `Distância do GPS incoerente para natação (média de ${speed.toFixed(2).replace(".", ",")} m/s, fora de ${SWIM_SPEED_MIN_MPS.toString().replace(".", ",")}–${SWIM_SPEED_MAX_MPS.toString().replace(".", ",")} m/s): ritmo não calculado.`,
    };
  }
  return {
    status: "ESTIMATE",
    label: "Distância do GPS — estimativa; em águas abertas a precisão é limitada.",
    pacePer100mSeconds: Math.round((realized.durationSeconds / realized.distanceMeters) * 100),
  };
}

type ComparableSide = {
  context: OpenWaterSession | null;
  observedConditions: string | null;
  durationSeconds: number | null;
};

const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
const conditionKey = (conditions: readonly Condition[]) =>
  conditions.map((condition) => `${condition.variable}:${normalize(condition.value)}`).sort().join("|");

/** §13.9 — comparability with a previous session: local, course, equipment and conditions. */
export function openWaterComparability(current: ComparableSide, previous: ComparableSide | null) {
  if (!previous || !current.context || !previous.context) return null;
  const differences: string[] = [];
  if (current.context.environment.kind !== previous.context.environment.kind) differences.push("ambiente");
  if (current.context.course.layout !== previous.context.course.layout
    || normalize(current.context.course.visualReference) !== normalize(previous.context.course.visualReference)
    || current.context.course.laps !== previous.context.course.laps) differences.push("percurso");
  if (normalize(current.context.equipment) !== normalize(previous.context.equipment)) differences.push("equipamento");
  if (conditionKey(current.context.expectedConditions) !== conditionKey(previous.context.expectedConditions)
    || normalize(current.observedConditions) !== normalize(previous.observedConditions)) differences.push("condições");
  const comparable = differences.length === 0;
  let sentence: string;
  if (current.durationSeconds === null || previous.durationSeconds === null) {
    sentence = comparable ? "Mesmo local, percurso e condições: compare pelo relato e pelas tarefas." : `Diferente da sessão anterior em ${differences.join(", ")} — comparação limitada.`;
  } else {
    const relation = current.durationSeconds < previous.durationSeconds ? "menor" : current.durationSeconds > previous.durationSeconds ? "maior" : "igual";
    sentence = comparable
      ? `Mesmo local, percurso e condições: tempo ${relation} que na sessão anterior.`
      : `Tempo ${relation} em condições diferentes (${differences.join(", ")}) — comparação limitada.`;
  }
  return { comparable, differences, sentence };
}

export function technicalTaskStatus(input: { hasExecutionOrReport: boolean; reviewed: boolean }) {
  if (!input.hasExecutionOrReport) return null;
  return input.reviewed ? "Tarefa técnica revisada pelo professor" : "Tarefa técnica pendente de revisão";
}

export function describeOpenWaterFeedback(feedback: OpenWaterFeedback | null) {
  if (!feedback) return [];
  return [
    feedback.orientation !== null ? `Orientação ${feedback.orientation}/5` : null,
    feedback.environmentalDifficulty !== null ? `Dificuldade ambiental ${feedback.environmentalDifficulty}/5` : null,
    feedback.confidence !== null ? `Confiança ${feedback.confidence}/5` : null,
    feedback.equipment ? `Equipamento: ${feedback.equipment}` : null,
    feedback.observedConditions ? `Condições observadas: ${feedback.observedConditions}` : null,
    feedback.feeding ? `Alimentação: ${feedback.feeding}` : null,
    feedback.incident ? `Incidente/decisão: ${feedback.incident}` : null,
  ].filter((line): line is string => line !== null);
}
