/**
 * SAM-64 — the coach's review (§6 step 12, §19.2, §21.1 Review, AC24).
 * "Realizado" and "revisado" are different facts: a session can be done and
 * still wait for the coach's review. Opening a notice is not a review (§22.7).
 */
export const REVIEW_DECISIONS = ["KEEP", "ADAPT_FUTURE", "RENEGOTIATE_GOAL", "MILESTONE_DECISION", "NONE"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const REVIEW_DECISION_LABELS: Record<ReviewDecision, string> = {
  KEEP: "Manter o planejamento",
  ADAPT_FUTURE: "Adaptar sessões futuras",
  RENEGOTIATE_GOAL: "Renegociar a meta",
  MILESTONE_DECISION: "Decisão sobre marco",
  NONE: "Sem decisão",
};

export type ReviewState = "REVIEWED" | "AWAITING_REVIEW" | null;

/** Only a session with something to review (a linked execution or the athlete's report) waits for review. */
export function reviewState(input: { reviewable: boolean; reviewed: boolean }): ReviewState {
  if (input.reviewed) return "REVIEWED";
  return input.reviewable ? "AWAITING_REVIEW" : null;
}

export const REVIEW_STATE_LABELS: Record<Exclude<ReviewState, null>, string> = {
  REVIEWED: "revisado",
  AWAITING_REVIEW: "realizado · aguardando revisão",
};

/** Where the athlete and the coach open a reviewed session. */
export function athleteAssignmentHref(schoolId: string | null, assignmentId: string) {
  return schoolId ? `/atleta/${schoolId}/treinos/${assignmentId}` : `/app/treinos/${assignmentId}`;
}

export function coachReviewHref(target: { schoolId: string | null; athleteId: string; workoutAssignmentId: string | null }) {
  const base = `/professor/${target.schoolId ?? "independente"}/atletas/${target.athleteId}`;
  return target.workoutAssignmentId ? `${base}/treinos/${target.workoutAssignmentId}` : base;
}
