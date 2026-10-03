/**
 * SAM-64 — the coach's review as the athlete (when visible) and the coach
 * read it, next to — never over — the athlete's own report (AC24).
 */
import { REVIEW_DECISION_LABELS, type ReviewDecision } from "@/modules/school/domain/coach-review";

export type CoachReviewView = {
  observation: string;
  decision: string;
  justification: string | null;
  nextReviewLocalDate: string | null;
  linkedAssignmentIds: string[];
  isVisible: boolean;
  version: number;
  updatedAt: Date;
  author: { name: string | null };
};

const localDate = (value: string) => value.split("-").reverse().join("/");

export function CoachReviewSummary({ review, audience }: { review: CoachReviewView; audience: "athlete" | "coach" }) {
  return (
    <div className="space-y-1.5 text-sm" data-testid="coach-review-summary">
      <p className="font-medium">{REVIEW_DECISION_LABELS[review.decision as ReviewDecision] ?? review.decision}</p>
      <p className="whitespace-pre-line" data-testid="coach-review-observation">{review.observation}</p>
      {review.justification && <p className="text-xs text-foreground/70">Justificativa: {review.justification}</p>}
      {review.nextReviewLocalDate && <p className="text-xs text-foreground/70">Próxima revisão: {localDate(review.nextReviewLocalDate)}</p>}
      {review.linkedAssignmentIds.length > 0 && (
        <p className="text-xs text-foreground/70">{review.linkedAssignmentIds.length} sessão(ões) futura(s) ligada(s) a esta revisão.</p>
      )}
      <p className="text-[11px] text-foreground/45">
        {review.author.name ?? "Professor"} · {review.updatedAt.toLocaleString("pt-BR")}
        {review.version > 1 ? ` · editada (versão ${review.version})` : ""}
        {audience === "coach" && !review.isVisible ? " · visível só para você" : ""}
      </p>
    </div>
  );
}
