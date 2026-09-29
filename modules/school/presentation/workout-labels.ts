/**
 * Labels for prescription and revision-request states, shared by the school
 * screens that show them (coach sheet and athlete sheet). No directive: usable
 * from Server and Client Components alike.
 */

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendado",
  AVAILABLE: "Disponível",
  COMPLETED: "Concluído",
  PARTIALLY_COMPLETED: "Parcial",
  MISSED: "Não realizado",
  CANCELLED: "Cancelado",
  RESCHEDULED: "Remarcado",
  JUSTIFIED: "Justificado",
  UNPLANNED: "Não planejado",
};

export const CHANGE_REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando professor",
  ACKNOWLEDGED: "Em análise",
  RESOLVED: "Resolvida",
  DECLINED: "Recusada",
  CANCELLED: "Retirada",
};
