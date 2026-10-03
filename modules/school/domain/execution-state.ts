/**
 * SAM-61 — derived execution state of a prescribed session (§6.1, AC12), with
 * no column of its own. A session that just passed is "aguardando registro"
 * while the sync window lasts — never an indistinct "falta"; cancelled,
 * justified and confirmed-not-done are each their own state.
 */
export const EXECUTION_STATES = ["FUTURE", "AWAITING_RECORD", "LINKED", "PARTIAL", "CONFIRMED_NOT_DONE", "NO_RECORD", "JUSTIFIED", "CANCELLED"] as const;
export type ExecutionState = (typeof EXECUTION_STATES)[number];

export const EXECUTION_STATE_LABELS: Record<ExecutionState, string> = {
  FUTURE: "Agendada",
  AWAITING_RECORD: "Aguardando registro",
  LINKED: "Realizada",
  PARTIAL: "Realizada parcialmente",
  CONFIRMED_NOT_DONE: "Não realizada (confirmado)",
  NO_RECORD: "Sem registro",
  JUSTIFIED: "Justificada",
  CANCELLED: "Cancelada",
};

export const DEFAULT_SYNC_WINDOW_HOURS = 48;

export function deriveExecutionState(input: {
  status: string;
  scheduledAt: Date | null;
  hasMatchedExecution: boolean;
  completion: "FULL" | "PARTIAL" | "NOT_DONE" | null;
  now: Date;
  syncWindowHours?: number;
}): ExecutionState {
  if (input.status === "CANCELLED" || input.status === "RESCHEDULED") return "CANCELLED";
  if (input.status === "JUSTIFIED") return "JUSTIFIED";
  if (input.completion === "NOT_DONE" || input.status === "MISSED") return "CONFIRMED_NOT_DONE";
  if (input.completion === "PARTIAL" || input.status === "PARTIALLY_COMPLETED") return "PARTIAL";
  if (input.hasMatchedExecution || input.status === "COMPLETED" || input.completion === "FULL") return "LINKED";
  if (!input.scheduledAt || input.scheduledAt > input.now) return "FUTURE";
  const windowMs = (input.syncWindowHours ?? DEFAULT_SYNC_WINDOW_HOURS) * 3_600_000;
  return input.now.getTime() - input.scheduledAt.getTime() <= windowMs ? "AWAITING_RECORD" : "NO_RECORD";
}

export const ADAPTATION_REASONS = ["SAFETY_CONDITIONS", "PAIN_OR_DISCOMFORT", "FATIGUE", "TIME", "EQUIPMENT", "ENVIRONMENT", "OTHER"] as const;
export type AdaptationReason = (typeof ADAPTATION_REASONS)[number];
export const ADAPTATION_REASON_LABELS: Record<AdaptationReason, string> = {
  // §13.8 — interrupting for safety/conditions is a decision, not a sporting failure.
  SAFETY_CONDITIONS: "Interrompida por segurança/condições",
  PAIN_OR_DISCOMFORT: "Dor ou desconforto",
  FATIGUE: "Cansaço",
  TIME: "Falta de tempo",
  EQUIPMENT: "Equipamento",
  ENVIRONMENT: "Local/clima",
  OTHER: "Outro motivo",
};

export const COMPLETION_LABELS = { FULL: "Realizei integralmente", PARTIAL: "Realizei parcialmente", NOT_DONE: "Não realizei" } as const;
