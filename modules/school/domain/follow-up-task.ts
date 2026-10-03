/**
 * SAM-55 — operational follow-up task (§7.2 of
 * docs/ryvano_treinos_eventos_acompanhamento.md): separate from the
 * notification — "marcar como lido não resolve a tarefa".
 */

export const FOLLOW_UP_STATUSES = ["NEW", "SEEN", "IN_PROGRESS", "RESOLVED", "RESCHEDULED", "CANCELLED"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];
export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  NEW: "Novo", SEEN: "Visto", IN_PROGRESS: "Em tratamento", RESOLVED: "Resolvido", RESCHEDULED: "Reagendado", CANCELLED: "Cancelado",
};
export const OPEN_FOLLOW_UP_STATUSES: readonly FollowUpStatus[] = ["NEW", "SEEN", "IN_PROGRESS", "RESCHEDULED"];

export const FOLLOW_UP_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export const FOLLOW_UP_PRIORITY_LABELS: Record<(typeof FOLLOW_UP_PRIORITIES)[number], string> = { LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta" };

export type FollowUpAction = "see" | "start" | "resolve" | "reschedule" | "cancel";

/** States each action may start from; RESOLVED/CANCELLED are final for manual actions. */
export const FOLLOW_UP_ACTION_FROM: Record<FollowUpAction, readonly FollowUpStatus[]> = {
  see: ["NEW"],
  start: ["NEW", "SEEN", "RESCHEDULED"],
  resolve: ["NEW", "SEEN", "IN_PROGRESS", "RESCHEDULED"],
  reschedule: ["NEW", "SEEN", "IN_PROGRESS", "RESCHEDULED"],
  cancel: ["NEW", "SEEN", "IN_PROGRESS", "RESCHEDULED"],
};

export const FOLLOW_UP_ACTION_TARGET: Record<FollowUpAction, FollowUpStatus> = {
  see: "SEEN", start: "IN_PROGRESS", resolve: "RESOLVED", reschedule: "RESCHEDULED", cancel: "CANCELLED",
};

export function isOpenFollowUp(status: string): boolean {
  return (OPEN_FOLLOW_UP_STATUSES as readonly string[]).includes(status);
}

/**
 * Counter definitions shown next to the numbers (§19.2): every counter says
 * what it counts and over which period.
 */
export const FOLLOW_UP_COUNTER_DEFINITIONS = {
  open: "Pendências novas, vistas, em tratamento ou reagendadas criadas no período.",
  overdue: "Pendências abertas com prazo (ou nova data) já vencido.",
  resolved: "Pendências resolvidas no período.",
} as const;
