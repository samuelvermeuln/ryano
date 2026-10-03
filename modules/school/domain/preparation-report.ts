/**
 * SAM-76 — the preparation's evolution in objective states (§17.7, §2.3).
 *
 * A milestone reads as "marco atingido", "precisa de revisão", "faltam
 * evidências" or "aguardando avaliação"; the count of achieved milestones is
 * an administrative completion, never readiness. The report never says
 * "pronto", "aptidão", "segurança", "garantia" or a probability of success —
 * `assertNoReadinessClaims` guards the rendered text.
 */
export const REPORT_STATES = ["ACHIEVED", "NEEDS_REVIEW", "MISSING_EVIDENCE", "AWAITING_ASSESSMENT", "PLANNED", "NOT_ACHIEVED", "CANCELLED"] as const;
export type ReportState = (typeof REPORT_STATES)[number];
export const REPORT_STATE_LABELS: Record<ReportState, string> = {
  ACHIEVED: "marco atingido",
  NEEDS_REVIEW: "precisa de revisão",
  MISSING_EVIDENCE: "faltam evidências",
  AWAITING_ASSESSMENT: "aguardando avaliação",
  PLANNED: "planejado",
  NOT_ACHIEVED: "não atingido (ou parcialmente)",
  CANCELLED: "cancelado",
};

export function milestoneReportState(milestone: { status: string; dueLocalDate: string; sessions: Array<{ executed: boolean; reviewed: boolean }> }, todayLocalDate: string): ReportState {
  switch (milestone.status) {
    case "ACHIEVED": return "ACHIEVED";
    case "PARTIALLY_ACHIEVED":
    case "NOT_ACHIEVED": return "NOT_ACHIEVED";
    case "CANCELLED": return "CANCELLED";
    case "EVIDENCE_RECEIVED":
    case "IN_REVIEW": return "AWAITING_ASSESSMENT";
    default: {
      // Planned or in progress: an executed reference session without a review needs one;
      // past the date with nothing executed, the evidence is missing.
      if (milestone.sessions.some((session) => session.executed && !session.reviewed)) return "NEEDS_REVIEW";
      if (milestone.dueLocalDate < todayLocalDate && !milestone.sessions.some((session) => session.executed)) return "MISSING_EVIDENCE";
      return "PLANNED";
    }
  }
}

/** "1 de 3 marcos concluídos — conclusão administrativa, não aptidão." */
export function milestoneCompletionLabel(achieved: number, total: number) {
  return `${achieved} de ${total} marco(s) concluído(s) — conclusão administrativa, não aptidão.`;
}

const FORBIDDEN = [/\b\d{1,3}\s?%\s*(pronto|pronta|preparad)/i, /\bapto\b|\baptid[ãa]o\b/i, /\bseguran[çc]a\b/i, /\bgarantia\b|\bgarantid[oa]\b/i, /probabilidade de sucesso/i, /\bpronto para a prova\b/i];

/** Throws when a rendered text makes a readiness, safety or guarantee claim (§2.3, §17.7). */
export function assertNoReadinessClaims(text: string) {
  const hit = FORBIDDEN.find((pattern) => pattern.test(text));
  if (hit) throw new Error(`Texto proibido no relatório: ${hit}`);
}

export function hasReadinessClaims(text: string) {
  return FORBIDDEN.some((pattern) => pattern.test(text));
}
