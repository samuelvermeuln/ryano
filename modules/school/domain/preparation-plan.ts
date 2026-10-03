/**
 * SAM-71 — phases and verifiable milestones of a preparation (§8).
 *
 * Periodisation is the coach's organisation (§8.1): phases of any length,
 * possibly absent or overlapping, and no ratio (5–8 %, 10 %, 3:1, 80/20) is
 * imposed or checked. A milestone states what will be observed (§8.3); a
 * synced file only brings evidence — ACHIEVED is always the coach's decision.
 */
import { z } from "zod";

import { isValidLocalDate } from "./local-date";

export const PHASE_TYPES = ["ASSESSMENT", "BASE", "DEVELOPMENT", "SPECIFIC", "TAPER", "COMPETITION", "RECOVERY", "CUSTOM"] as const;
export type PhaseType = (typeof PHASE_TYPES)[number];

export const PHASE_TYPE_LABELS: Record<PhaseType, string> = {
  ASSESSMENT: "Avaliação",
  BASE: "Base",
  DEVELOPMENT: "Desenvolvimento",
  SPECIFIC: "Específico",
  TAPER: "Redução pré-prova",
  COMPETITION: "Competição",
  RECOVERY: "Recuperação",
  CUSTOM: "Personalizada",
};

export const MILESTONE_EVIDENCE_TYPES = ["AUTOMATIC", "MANUAL", "IN_PERSON", "COMBINED"] as const;
export type MilestoneEvidenceType = (typeof MILESTONE_EVIDENCE_TYPES)[number];
export const MILESTONE_EVIDENCE_LABELS: Record<MilestoneEvidenceType, string> = {
  AUTOMATIC: "Arquivo sincronizado",
  MANUAL: "Relato/registro do aluno",
  IN_PERSON: "Observação presencial",
  COMBINED: "Combinada",
};

export const MILESTONE_STATUSES = ["PLANNED", "IN_PROGRESS", "EVIDENCE_RECEIVED", "IN_REVIEW", "ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED", "CANCELLED"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  PLANNED: "Planejado",
  IN_PROGRESS: "Em andamento",
  EVIDENCE_RECEIVED: "Evidência recebida",
  IN_REVIEW: "Em análise",
  ACHIEVED: "Atingido",
  PARTIALLY_ACHIEVED: "Parcialmente atingido",
  NOT_ACHIEVED: "Não atingido",
  CANCELLED: "Cancelado",
};

/** What only the coach's decision sets. */
export const MILESTONE_DECISIONS = ["ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED"] as const;
export type MilestoneDecision = (typeof MILESTONE_DECISIONS)[number];
/** What the coach may set by hand besides a decision; EVIDENCE_RECEIVED only comes from evidence. */
export const MILESTONE_MANUAL_STATUSES = ["PLANNED", "IN_PROGRESS", "IN_REVIEW", "CANCELLED"] as const;

const CLOSED: readonly MilestoneStatus[] = ["ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED", "CANCELLED"];
export const isMilestoneOpen = (status: MilestoneStatus) => !CLOSED.includes(status);

/** Linked execution or the athlete's report arrived: an open milestone that still waited for it moves on. */
export function statusAfterEvidence(status: MilestoneStatus): MilestoneStatus {
  return status === "PLANNED" || status === "IN_PROGRESS" ? "EVIDENCE_RECEIVED" : status;
}

const localDate = z.string().refine((value) => isValidLocalDate(value), "Data inválida.");
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((value) => value || null);

export const phaseInputSchema = z.strictObject({
  type: z.enum(PHASE_TYPES),
  customName: optionalText(120),
  startLocalDate: localDate,
  endLocalDate: localDate,
  purpose: optionalText(1000),
  sportTypes: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  /** The coach's own taper/protocol note (§8.1, T05–T06) — recorded, never applied. */
  protocolNotes: optionalText(2000),
}).superRefine((value, ctx) => {
  if (value.type === "CUSTOM" && !value.customName) ctx.addIssue({ code: "custom", path: ["customName"], message: "Dê um nome à fase personalizada." });
  if (value.startLocalDate > value.endLocalDate) ctx.addIssue({ code: "custom", path: ["endLocalDate"], message: "A fase termina antes de começar." });
});
export type PhaseInput = z.infer<typeof phaseInputSchema>;

export const milestoneInputSchema = z.strictObject({
  title: z.string().trim().min(1, "Dê um título ao marco.").max(200),
  criterion: z.string().trim().min(1, "Diga o que será observado.").max(2000),
  dueLocalDate: localDate,
  evidenceType: z.enum(MILESTONE_EVIDENCE_TYPES),
  phaseId: z.string().min(1).max(256).nullish().transform((value) => value ?? null),
});
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;

export const phaseLabel = (phase: { type: string; customName: string | null }) =>
  phase.type === "CUSTOM" ? phase.customName ?? "Personalizada" : PHASE_TYPE_LABELS[phase.type as PhaseType] ?? phase.type;

/**
 * §8.4 — a session linked to several events is still ONE session: each event
 * counts it, the athlete's total counts it once. Sessions shared by two MAIN
 * events are surfaced as a conflict, never resolved silently.
 */
export function sessionTotalsAcrossEvents(links: Array<{ assignmentId: string; participationId: string; durationSeconds: number | null; mainEvent: boolean }>) {
  const perEvent = new Map<string, { sessions: number; seconds: number }>();
  const athlete = new Map<string, number>();
  const mainEventsOf = new Map<string, Set<string>>();
  for (const link of links) {
    const event = perEvent.get(link.participationId) ?? { sessions: 0, seconds: 0 };
    event.sessions += 1;
    event.seconds += link.durationSeconds ?? 0;
    perEvent.set(link.participationId, event);
    athlete.set(link.assignmentId, link.durationSeconds ?? 0);
    if (link.mainEvent) mainEventsOf.set(link.assignmentId, new Set([...(mainEventsOf.get(link.assignmentId) ?? []), link.participationId]));
  }
  return {
    perEvent: Object.fromEntries(perEvent),
    athlete: { sessions: athlete.size, seconds: [...athlete.values()].reduce((sum, value) => sum + value, 0) },
    sharedSessions: [...new Set(links.map((link) => link.assignmentId))].filter((id) => links.filter((link) => link.assignmentId === id).length > 1),
    mainEventConflicts: [...mainEventsOf.entries()].filter(([, events]) => events.size > 1).map(([assignmentId]) => assignmentId),
  };
}

/**
 * §8.4 — a goal as it stood at a past instant: the current row with every
 * later revision undone (revisions keep `{field: {from, to}}`). Changing the
 * target event later never rewrites what the goal was on that date.
 */
export function goalAsOf<T extends Record<string, unknown>>(current: T, revisions: Array<{ changedAt: Date; changes: unknown }>, at: Date): T {
  const later = revisions.filter((revision) => revision.changedAt > at).sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
  const state: Record<string, unknown> = { ...current };
  for (const revision of later) {
    for (const [field, change] of Object.entries((revision.changes ?? {}) as Record<string, { from?: unknown }>)) {
      if (change && typeof change === "object" && "from" in change) state[field] = change.from;
    }
  }
  return state as T;
}

/** Days between two local dates (b − a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);
}

export function shiftLocalDate(date: string, days: number) {
  const shifted = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * §8.2 — the illustrative 12-week schedule, offered ONLY as editable text the
 * coach may copy (paraphrased). It is an administrative example: it does not
 * say 12 weeks suffice for any event, and nothing is generated from it.
 */
export const ILLUSTRATIVE_SCHEDULE: Array<{ moment: string; delivery: string; evidence: string }> = [
  { moment: "Início", delivery: "Avaliação, prioridades e objetivo pactuado", evidence: "De onde o atleta parte" },
  { moment: "Semanas 1–3", delivery: "Sessões iniciais e critérios de observação", evidence: "Disponibilidade e tolerância à rotina" },
  { moment: "Semana 4", delivery: "Primeira revisão formal", evidence: "Manter, adaptar ou renegociar o objetivo" },
  { moment: "Semanas 5–7", delivery: "Trabalho específico escolhido pelo professor", evidence: "Evolução das capacidades escolhidas" },
  { moment: "Semana 8", delivery: "Marco ou simulado adequado", evidence: "Estratégia e lacunas revistas" },
  { moment: "Semanas 9–10", delivery: "Ajustes específicos e logística", evidence: "Equipamentos, percurso e plano de prova" },
  { moment: "Semanas finais", delivery: "Redução pré-prova por decisão individual", evidence: "Carga e condições revistas" },
  { moment: "Evento", delivery: "Execução e registro do resultado", evidence: "Comparação com a meta pactuada" },
  { moment: "Pós-evento", delivery: "Revisão e recuperação individualizada", evidence: "Aprendizados e próximo ciclo" },
];

export const ILLUSTRATIVE_SCHEDULE_TEXT = [
  "Modelo ilustrativo (exemplo administrativo; não indica que 12 semanas bastem para qualquer prova):",
  ...ILLUSTRATIVE_SCHEDULE.map((row) => `- ${row.moment}: ${row.delivery} — ${row.evidence}.`),
].join("\n");