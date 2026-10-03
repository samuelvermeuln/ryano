/**
 * SAM-62 — the sentence the athlete and the coach read about a link (§2.2):
 * "Associada automaticamente — mesma modalidade, mesmo dia, duração 95% (score 86)".
 * Written only from the persisted detail; a link without it (before 0070)
 * says so instead of inventing criteria.
 */
import type { MatchDetail } from "../domain/workout-matching";

export type MatchMethod = "AUTO" | "ATHLETE" | "COACH" | "MANUAL_ENTRY" | "STRUCTURED_ID";

const METHOD_LABEL: Record<MatchMethod, string> = {
  AUTO: "Associada automaticamente",
  ATHLETE: "Associada pelo aluno",
  COACH: "Associada pelo professor",
  MANUAL_ENTRY: "Registro manual do aluno",
  STRUCTURED_ID: "Associada pelo treino enviado ao relógio",
};

function percent(ratio: number) {
  return `${Math.round(ratio * 100)}%`;
}

function dayPhrase(days: number) {
  if (days === 0) return "mesmo dia";
  const abs = Math.abs(days);
  return `${abs} dia${abs > 1 ? "s" : ""} ${days > 0 ? "depois" : "antes"} do previsto`;
}

export function isMatchDetail(value: unknown): value is MatchDetail {
  return Boolean(value && typeof value === "object" && "facts" in value && "composite" in value);
}

export function describeMatch(input: { matchMethod: string | null; matchDetail: unknown; matchScore: number }): string {
  const method = (input.matchMethod ?? "AUTO") as MatchMethod;
  const label = METHOD_LABEL[method] ?? METHOD_LABEL.AUTO;
  if (method === "MANUAL_ENTRY") return label;
  if (!isMatchDetail(input.matchDetail)) return `${label} (score ${input.matchScore}; critérios não registrados nesta associação)`;
  const { facts } = input.matchDetail;
  const parts = [
    facts.sameSport ? "mesma modalidade" : "outra modalidade",
    facts.dayDifference === null ? null : dayPhrase(facts.dayDifference),
    facts.durationRatio === null ? null : `duração ${percent(facts.durationRatio)}`,
    facts.distanceRatio === null ? null : `distância ${percent(facts.distanceRatio)}`,
  ].filter(Boolean);
  return `${label} — ${parts.join(", ")} (score ${input.matchDetail.composite})`;
}
