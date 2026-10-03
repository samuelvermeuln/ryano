/**
 * SAM-54 — the coach's follow-up of a participation (§6, §6.1 of
 * docs/ryvano_treinos_eventos_acompanhamento.md).
 *
 * "O acompanhamento administrativo começa no cadastro. A preparação prescrita
 * começa quando o professor publica o planejamento." The record exists from
 * the participation on; ACTIVE ("plano em andamento") is only reached when a
 * published prescription is linked (SAM-59/SAM-60) — never set by hand here.
 */

export const PREPARATION_STATUSES = ["UNASSIGNED", "AWAITING_ASSESSMENT", "PLANNING", "ACTIVE", "REVIEW_PENDING", "PAUSED", "CLOSED"] as const;
export type PreparationStatus = (typeof PREPARATION_STATUSES)[number];

export const PREPARATION_STATUS_LABELS: Record<PreparationStatus, string> = {
  UNASSIGNED: "Sem professor responsável",
  AWAITING_ASSESSMENT: "Aguardando avaliação",
  PLANNING: "Em planejamento",
  ACTIVE: "Preparação em andamento",
  REVIEW_PENDING: "Revisão pendente",
  PAUSED: "Pausado",
  CLOSED: "Encerrado",
};

/** What the athlete reads about their event (§6 passo 5, §22.6). */
export function preparationStatusText(status: string, coachName: string | null): string {
  const coach = coachName ?? "responsável";
  switch (status) {
    case "UNASSIGNED": return "Evento registrado — sem professor responsável";
    case "AWAITING_ASSESSMENT": return `Evento registrado — aguardando avaliação do professor ${coach}`;
    case "PLANNING": return `Em planejamento com ${coach}`;
    case "ACTIVE": return `Preparação em andamento com ${coach}`;
    case "REVIEW_PENDING": return `Revisão pendente com ${coach}`;
    case "PAUSED": return "Acompanhamento pausado";
    case "CLOSED": return "Acompanhamento encerrado";
    default: return status;
  }
}

export type PreparationAction = "assume" | "assign" | "pause" | "resume" | "close";

/** States each manual action may start from. */
export const ACTION_FROM: Record<PreparationAction, readonly PreparationStatus[]> = {
  assume: ["UNASSIGNED", "AWAITING_ASSESSMENT"],
  assign: ["UNASSIGNED", "AWAITING_ASSESSMENT", "PLANNING", "PAUSED", "REVIEW_PENDING"],
  pause: ["AWAITING_ASSESSMENT", "PLANNING", "ACTIVE", "REVIEW_PENDING"],
  resume: ["PAUSED"],
  close: ["UNASSIGNED", "AWAITING_ASSESSMENT", "PLANNING", "ACTIVE", "REVIEW_PENDING", "PAUSED"],
};

export function canApply(action: PreparationAction, status: string): boolean {
  return (ACTION_FROM[action] as readonly string[]).includes(status);
}
