/**
 * SAM-63 — the transparent comparison of one session (§17.1, §17.2, §17.4,
 * §17.6, AC11): five separate questions, never one "100% concluído".
 *
 *  1. Houve atividade?            — link / manual record / state.
 *  2. Quanto foi realizado?       — time and distance against the prescription,
 *                                   formula and denominator visible; >100% shown
 *                                   as is, never as "better".
 *  3. Como foi executado?         — the existing compliance score as a secondary
 *                                   reading (per block comes in phase 2).
 *  4. Qual foi a resposta?        — RPE, difficulty, pain, comments, coach note.
 *  5. Relação com a meta?         — only what was registered; nothing inferred.
 *
 * Not measured is "não medido", never 0. Distances of different sports are
 * never compared. sRPE appears only when the coach chose the method, labelled
 * as a monitoring instrument, not a diagnosis. Nothing here sums CTL/ATL/TSB
 * across providers, estimates injury risk or reads a similar mean HR as a
 * similar stimulus (§17.6).
 */
import { EXECUTION_STATE_LABELS, type ExecutionState } from "../domain/execution-state";

export const NOT_MEASURED = "não medido";

export type SessionLoadMethod = "SRPE" | null;

export type SessionComparisonInput = {
  state: ExecutionState;
  prescribed: { sportType: string; durationSeconds: number | null; distanceMeters: number | null };
  /** Pieces already combined once (SAM-62); null = nothing recorded. */
  realized: { sportType: string; durationSeconds: number | null; distanceMeters: number | null; source: string | null; method: string | null } | null;
  feedback: { completion: string | null; rpe: number | null; rpeScale: string | null; difficulty: number | null; painReported: boolean; comment: string | null } | null;
  coachNote: string | null;
  complianceScore: number | null;
  loadMethod: SessionLoadMethod;
};

export type VolumeMetric =
  | { status: "compared"; percent: number; realized: number; prescribed: number; formula: string; aboveTarget: boolean }
  | { status: "not-measured" | "not-prescribed" | "other-sport" | "no-record"; label: string };

function percentOf(realized: number, prescribed: number) {
  return Math.round((100 * realized) / prescribed);
}

const minutes = (seconds: number) => Math.round((seconds / 60) * 10) / 10;
const km = (meters: number) => Math.round((meters / 1000) * 100) / 100;
const decimal = (value: number) => String(value).replace(".", ",");

function volume(
  kind: "time" | "distance",
  prescribed: number | null,
  realized: number | null,
  context: { recorded: boolean; sameSport: boolean },
): VolumeMetric {
  if (!context.recorded) return { status: "no-record", label: "sem registro" };
  if (!prescribed || prescribed <= 0) return { status: "not-prescribed", label: kind === "time" ? "sem tempo prescrito" : "sem distância prescrita" };
  if (kind === "distance" && !context.sameSport) return { status: "other-sport", label: "outra modalidade — distâncias não são comparadas" };
  if (realized === null) return { status: "not-measured", label: NOT_MEASURED };
  const percent = percentOf(realized, prescribed);
  const formula = kind === "time"
    ? `100 × ${decimal(minutes(realized))} min realizados (tempo decorrido) ÷ ${decimal(minutes(prescribed))} min prescritos (tempo total, com descansos)`
    : `100 × ${decimal(km(realized))} km realizados ÷ ${decimal(km(prescribed))} km prescritos`;
  return { status: "compared", percent, realized, prescribed, formula, aboveTarget: percent > 100 };
}

/** sRPE = duration (min) × session RPE, arbitrary units; only with the method chosen and both values present. */
export function sessionRpeLoad(durationSeconds: number | null, rpe: number | null, method: SessionLoadMethod) {
  if (method !== "SRPE") return null;
  if (durationSeconds === null || rpe === null) return { status: "not-measured" as const, label: NOT_MEASURED };
  const durationMinutes = Math.round(durationSeconds / 60);
  return {
    status: "computed" as const,
    value: durationMinutes * rpe,
    formula: `${durationMinutes} min × RPE ${rpe} = ${durationMinutes * rpe} UA`,
    note: "sRPE (escala CR10, RPE da sessão) — instrumento de acompanhamento, não diagnóstico.",
  };
}

export function sessionComparison(input: SessionComparisonInput) {
  const recorded = input.realized !== null;
  const sameSport = recorded && input.realized!.sportType === input.prescribed.sportType;
  const presence = recorded
    ? input.realized!.method === "MANUAL_ENTRY" || input.realized!.source === "manual"
      ? "Sim — registro manual do aluno"
      : "Sim — atividade associada"
    : input.feedback?.completion === "NOT_DONE" ? "Não — o aluno informou que não realizou" : "Nenhuma atividade registrada";
  return {
    stateLabel: EXECUTION_STATE_LABELS[input.state],
    presence,
    time: volume("time", input.prescribed.durationSeconds, input.realized?.durationSeconds ?? null, { recorded, sameSport: true }),
    distance: volume("distance", input.prescribed.distanceMeters, input.realized?.distanceMeters ?? null, { recorded, sameSport }),
    otherSport: recorded && !sameSport,
    execution: input.complianceScore === null
      ? { label: "Sem leitura de execução", secondary: null }
      : { label: "Compliance (leitura secundária — não é % concluído)", secondary: Math.round(input.complianceScore) },
    response: {
      rpe: input.feedback?.rpe ?? null,
      rpeScale: input.feedback?.rpeScale ?? null,
      difficulty: input.feedback?.difficulty ?? null,
      pain: input.feedback?.painReported ?? false,
      comment: input.feedback?.comment ?? null,
      coachNote: input.coachNote,
    },
    goal: "Sem relação registrada com meta ou marco.",
    load: sessionRpeLoad(input.realized?.durationSeconds ?? null, input.feedback?.rpe ?? null, input.loadMethod),
  };
}

export type SessionComparison = ReturnType<typeof sessionComparison>;
