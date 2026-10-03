/**
 * SAM-53 — structured goals (§5.4, §8.4 of
 * docs/ryvano_treinos_eventos_acompanhamento.md).
 *
 * The athlete's wish (ATHLETE_DESIRED) and the goal agreed with the coach
 * (COACH_AGREED) are separate records: a time target stays a wish even when
 * the coach agrees on "concluir com controle". Every change keeps a revision,
 * so the goal in force on any past date can be shown (§8.4: changing the
 * target event does not rewrite history). A goal does not need an event.
 */
import { z } from "zod";
import { isValidLocalDate } from "./local-date";

export const GOAL_TYPES = ["RESULT", "PERFORMANCE", "PROCESS", "PREPARATION"] as const;
export const GOAL_TYPE_LABELS: Record<(typeof GOAL_TYPES)[number], string> = {
  RESULT: "Resultado", PERFORMANCE: "Desempenho", PROCESS: "Processo", PREPARATION: "Preparação",
};
export const GOAL_STATUSES = ["ACTIVE", "ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED", "CANCELLED", "REPLACED"] as const;
export const GOAL_STATUS_LABELS: Record<(typeof GOAL_STATUSES)[number], string> = {
  ACTIVE: "Ativo", ACHIEVED: "Alcançado", PARTIALLY_ACHIEVED: "Parcialmente alcançado",
  NOT_ACHIEVED: "Não alcançado", CANCELLED: "Cancelado", REPLACED: "Substituído",
};
export const GOAL_ORIGINS = ["ATHLETE_DESIRED", "COACH_AGREED"] as const;
export const GOAL_ORIGIN_LABELS: Record<(typeof GOAL_ORIGINS)[number], string> = {
  ATHLETE_DESIRED: "Desejado pelo aluno", COACH_AGREED: "Pactuado com o professor",
};

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((value) => (value && value.length > 0 ? value : null));
const optionalNumber = z.number().finite().min(-1_000_000_000).max(1_000_000_000).nullish().transform((value) => value ?? null);

const goalFields = {
  type: z.enum(GOAL_TYPES),
  description: z.string().trim().min(2, "Descreva o objetivo.").max(1000),
  indicator: optionalText(120),
  unit: optionalText(20),
  /** SAM-75 — §16.2: a goal of one segment of a multisport event (SWIM | T1 | BIKE | T2 | RUN). */
  segment: z.enum(["SWIM", "T1", "BIKE", "T2", "RUN"]).nullish().transform((value) => value ?? null),
  baselineValue: optionalNumber,
  targetValue: optionalNumber,
  targetMin: optionalNumber,
  targetMax: optionalNumber,
  dueLocalDate: z.string().refine(isValidLocalDate, "Prazo inválido (AAAA-MM-DD).").nullish().transform((value) => value ?? null),
  evaluationMethod: optionalText(500),
  acceptedEvidence: optionalText(500),
};

function checkRange(goal: { targetMin?: number | null; targetMax?: number | null; targetValue?: number | null }, ctx: z.RefinementCtx) {
  if (goal.targetMin != null && goal.targetMax != null && goal.targetMin > goal.targetMax) {
    ctx.addIssue({ code: "custom", path: ["targetMax"], message: "O máximo da faixa não pode ser menor que o mínimo." });
  }
  if (goal.targetValue != null && (goal.targetMin != null || goal.targetMax != null)) {
    ctx.addIssue({ code: "custom", path: ["targetValue"], message: "Informe um alvo ou uma faixa, não os dois." });
  }
}

export const goalInputSchema = z.strictObject({
  ...goalFields,
  athleteId: z.string().min(1).max(256).optional(),
  participationId: z.string().min(1).max(256).nullish().transform((value) => value ?? null),
  origin: z.enum(GOAL_ORIGINS).default("ATHLETE_DESIRED"),
  /** For an agreed goal: the wish it answers (kept, never erased). */
  desiredGoalId: z.string().min(1).max(256).nullish().transform((value) => value ?? null),
}).superRefine((goal, ctx) => {
  checkRange(goal, ctx);
  if (goal.desiredGoalId && goal.origin !== "COACH_AGREED") {
    ctx.addIssue({ code: "custom", path: ["desiredGoalId"], message: "Só o objetivo pactuado responde a um desejo." });
  }
});
export type GoalInput = z.infer<typeof goalInputSchema>;

/** No defaults: a partial patch never "changes" what was not sent. */
export const goalPatchSchema = z.strictObject({
  ...Object.fromEntries(Object.entries(goalFields).map(([key, schema]) => [key, schema.optional()])) as {
    [K in keyof typeof goalFields]: z.ZodOptional<(typeof goalFields)[K]>;
  },
  participationId: z.string().min(1).max(256).nullish(),
  status: z.enum(GOAL_STATUSES).optional(),
  statusReason: optionalText(500).optional(),
  expectedVersion: z.number().int().min(1),
  reason: optionalText(500).optional(),
}).superRefine((patch, ctx) => {
  checkRange(patch, ctx);
  if (patch.status && patch.status !== "ACTIVE" && !patch.statusReason && !patch.reason) {
    ctx.addIssue({ code: "custom", path: ["statusReason"], message: "Justifique a mudança de situação." });
  }
});

/** Changes that ask the responsible coach to look at the athlete's wish again. */
export const GOAL_REVIEW_FIELDS = ["type", "targetValue", "targetMin", "targetMax", "dueLocalDate", "description", "participationId"] as const;

type Changes = Record<string, { from: unknown; to: unknown }>;

/**
 * The goal as it was in force at `at` (§8.4): start from the current values
 * and undo, newest first, every revision made after that instant. Returns
 * null when the goal did not exist yet.
 */
export function goalVersionAt<T extends Record<string, unknown> & { createdAt: Date }>(
  current: T,
  revisions: Array<{ changedAt: Date; changes: unknown }>,
  at: Date,
): T | null {
  if (current.createdAt > at) return null;
  const snapshot: Record<string, unknown> = { ...current };
  const later = revisions.filter((revision) => revision.changedAt > at).sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
  for (const revision of later) {
    for (const [field, change] of Object.entries(revision.changes as Changes)) snapshot[field] = change.from;
  }
  return snapshot as T;
}
