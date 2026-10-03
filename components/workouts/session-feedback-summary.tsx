/**
 * SAM-61 — the athlete's report as both the athlete and the coach read it,
 * with the derived execution state. The coach's own observation lives in the
 * comments/evaluation with its author (AC24); it never edits this text.
 */
import { ADAPTATION_REASON_LABELS, COMPLETION_LABELS, EXECUTION_STATE_LABELS, type AdaptationReason, type ExecutionState } from "@/modules/school/domain/execution-state";

export type SessionFeedbackView = {
  completion: string | null;
  rpe: number | null;
  rpeScale: string | null;
  difficulty: number | null;
  adaptationReason: string | null;
  adaptationNote: string | null;
  painReported: boolean;
  painNote: string | null;
  comment: string | null;
  attachmentUrl: string | null;
  updatedAt: Date;
  execution: { source: string } | null;
};

export function SessionFeedbackSummary({ feedback, state }: { feedback: SessionFeedbackView | null; state: ExecutionState }) {
  return (
    <div className="space-y-1.5 text-sm" data-testid="session-feedback-summary">
      <p>
        <span className="text-foreground/55">Situação: </span>
        <span data-testid="execution-state" data-state={state}>{EXECUTION_STATE_LABELS[state]}</span>
      </p>
      {!feedback ? (
        <p className="text-xs text-foreground/55">Sem relato do aluno ainda.</p>
      ) : (
        <>
          {feedback.completion && <p><span className="text-foreground/55">Relato: </span>{COMPLETION_LABELS[feedback.completion as keyof typeof COMPLETION_LABELS] ?? feedback.completion}{feedback.execution?.source === "manual" ? " · registro manual do aluno" : ""}</p>}
          {feedback.adaptationReason && (
            <p data-testid="feedback-reason">
              <span className="text-foreground/55">Motivo: </span>
              {ADAPTATION_REASON_LABELS[feedback.adaptationReason as AdaptationReason] ?? feedback.adaptationReason}
              {feedback.adaptationNote ? ` — ${feedback.adaptationNote}` : ""}
            </p>
          )}
          {feedback.rpe !== null && <p><span className="text-foreground/55">RPE: </span>{feedback.rpe}/10{feedback.rpeScale ? ` (${feedback.rpeScale})` : ""}</p>}
          {feedback.difficulty !== null && <p><span className="text-foreground/55">Dificuldade: </span>{feedback.difficulty}/5</p>}
          {feedback.painReported && <p className="text-amber-300" data-testid="feedback-pain">Dor/dificuldade relatada: {feedback.painNote}</p>}
          {feedback.comment && <p><span className="text-foreground/55">Observação do aluno: </span>{feedback.comment}</p>}
          {feedback.attachmentUrl && <p><a href={feedback.attachmentUrl} target="_blank" rel="noreferrer" className="underline">Anexo do aluno</a></p>}
          <p className="text-[11px] text-foreground/45">Relatado em {feedback.updatedAt.toLocaleString("pt-BR")}</p>
        </>
      )}
    </div>
  );
}
