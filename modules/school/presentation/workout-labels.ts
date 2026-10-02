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

/**
 * SAM-33 — prescrito × executado (`derivePrescriptionOutcome`). Lido por
 * atleta, professor e escola com as mesmas palavras.
 */
export const PRESCRIPTION_OUTCOME_LABELS: Record<string, string> = {
  PLANNED_NOT_EXECUTED: "Planejado, não executado",
  EXECUTED_AS_PLANNED: "Conforme planejado",
  EXECUTED_PARTIALLY: "Executado parcialmente",
  EXECUTED_DIFFERENTLY: "Diferente do planejado",
  UNPLANNED_ACTIVITY: "Não planejada",
};

export const CHANGE_REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando professor",
  ACKNOWLEDGED: "Em análise",
  RESOLVED: "Resolvida",
  DECLINED: "Recusada",
  CANCELLED: "Retirada",
};

/**
 * `WorkoutAssignmentHistory.eventType` is a free `VarChar`, written by whichever
 * use case recorded the event. Unknown values fall through to the raw string
 * rather than being hidden, so a new event type shows up as itself instead of
 * disappearing from the trail.
 */
export const ASSIGNMENT_EVENT_LABELS: Record<string, string> = {
  ASSIGNED: "Treino prescrito",
  RESCHEDULED: "Remarcado",
  CANCELLED: "Cancelado",
  SELF_LOGGED: "Registrado pelo atleta",
  PLAN_ADAPTATION_ACCEPTED: "Adaptação de plano aceita",
  COMPLIANCE_RECALCULATED: "Aderência recalculada",
  GARMIN_RECONNECT_NOTIFICATION_SENT: "Aviso de reconexão enviado",
};

export const EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Iniciante",
  INTERMEDIATE: "Intermediário",
  ADVANCED: "Avançado",
  ELITE: "Elite",
};

/**
 * Compliance breakdown dimensions, as stored by `CalculateWorkoutCompliance`.
 * Unknown keys fall back to the raw dimension name.
 */
export const COMPLIANCE_DIMENSION_LABELS: Record<string, string> = {
  distance: "Distância",
  duration: "Duração",
  pace: "Ritmo",
  heartRate: "FC",
  power: "Potência",
  intervals: "Intervalos",
  rest: "Descanso",
  zones: "Zonas",
};

/**
 * Kinds of entry in the athlete's interaction trail
 * (`GetCoachAthleteTimeline`). Each kind answers "who acted": the coach, the
 * school, or the athlete.
 */
export const TIMELINE_ENTRY_LABELS: Record<string, string> = {
  "assignment-event": "Prescrição",
  "change-request": "Pedido de alteração",
  "change-resolution": "Resposta do professor",
  evaluation: "Avaliação do professor",
  feedback: "Feedback do atleta",
};
