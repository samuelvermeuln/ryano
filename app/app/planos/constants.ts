/**
 * TM043/TM044 — visual + label config for the six `/app/planos` states
 * (RF-111). Shared between the list and detail pages so both agree on the
 * same wording; see `ListMyTrainingLicenses`'s `TrainingPlanState`.
 */
import type { TrainingPlanState } from "@/modules/school/application/list-my-training-licenses";

export const PLAN_STATE_CONFIG: Record<TrainingPlanState, { label: string; dot: string; pill: string }> = {
  awaiting_payment: { label: "Aguardando pagamento", dot: "bg-amber-400", pill: "bg-amber-400/15 text-amber-300" },
  not_started: { label: "Não iniciado", dot: "bg-sky-400", pill: "bg-sky-400/15 text-sky-300" },
  in_progress: { label: "Em andamento", dot: "bg-emerald-500", pill: "bg-emerald-500/15 text-emerald-400" },
  paused: { label: "Pausado", dot: "bg-amber-400", pill: "bg-amber-400/15 text-amber-300" },
  completed: { label: "Concluído", dot: "bg-foreground/40", pill: "bg-white/8 text-foreground/60" },
  refunded: { label: "Reembolsado", dot: "bg-destructive", pill: "bg-destructive/15 text-destructive" },
  expired: { label: "Expirado", dot: "bg-foreground/30", pill: "bg-white/8 text-foreground/50" },
};
