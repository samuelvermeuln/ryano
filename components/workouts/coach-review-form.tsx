"use client";

/**
 * SAM-64 — "Revisar" (§19.2): technical observation, decision, justification,
 * next review and links to future sessions already published. Saving changes
 * no prescription; to adapt, publish the change and link it here.
 */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Modal } from "@/components/modal";
import { FIELD_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { REVIEW_DECISION_LABELS, REVIEW_DECISIONS, type ReviewDecision } from "@/modules/school/domain/coach-review";

export type CoachReviewFormValues = {
  observation: string;
  decision: ReviewDecision;
  justification: string | null;
  nextReviewLocalDate: string | null;
  linkedAssignmentIds: string[];
  isVisible: boolean;
};

export function CoachReviewForm({
  target, existing, futureSessions, disabledReason,
}: {
  target: { type: "assignment"; assignmentId: string } | { type: "preparation"; preparationId: string };
  existing: CoachReviewFormValues | null;
  futureSessions: Array<{ id: string; label: string }>;
  /** Why it cannot be reviewed yet (same rule as the use case); null = enabled. */
  disabledReason: string | null;
}) {
  const router = useRouter();
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [observation, setObservation] = useState(existing?.observation ?? "");
  const [decision, setDecision] = useState<ReviewDecision>(existing?.decision ?? "KEEP");
  const [justification, setJustification] = useState(existing?.justification ?? "");
  const [nextReview, setNextReview] = useState(existing?.nextReviewLocalDate ?? "");
  const [linked, setLinked] = useState<string[]>(existing?.linkedAssignmentIds ?? []);
  const [visible, setVisible] = useState(existing?.isVisible ?? true);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/coach-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target, observation, decision, justification: justification || null,
          nextReviewLocalDate: nextReview || null, linkedAssignmentIds: linked, isVisible: visible,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) { setError(payload?.message ?? "Não foi possível salvar a revisão."); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button ref={opener} type="button" className={SECONDARY_ACTION_CLASS} disabled={disabledReason !== null} onClick={() => setOpen(true)} title={disabledReason ?? undefined}>
        {existing ? "Editar revisão" : "Revisar"}
      </button>
      {disabledReason && <p className="text-xs text-foreground/55">{disabledReason}</p>}
      {open && (
        <Modal title={existing ? "Editar revisão" : "Revisar sessão"} onClose={() => setOpen(false)} returnFocusTo={opener} size="lg">
          <form onSubmit={submit} className="space-y-3 text-sm" data-testid="coach-review-form">
            <label className="grid gap-1">Observação técnica
              <textarea required rows={4} maxLength={5000} value={observation} onChange={(event) => setObservation(event.target.value)} className={FIELD_CLASS} aria-label="Observação técnica" />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1">Decisão
                <select value={decision} onChange={(event) => setDecision(event.target.value as ReviewDecision)} className={FIELD_CLASS} aria-label="Decisão">
                  {REVIEW_DECISIONS.map((value) => <option key={value} value={value}>{REVIEW_DECISION_LABELS[value]}</option>)}
                </select>
              </label>
              <label className="grid gap-1">Próxima revisão
                <input type="date" value={nextReview} onChange={(event) => setNextReview(event.target.value)} className={FIELD_CLASS} aria-label="Próxima revisão" />
              </label>
            </div>
            <label className="grid gap-1">Justificativa{decision !== "KEEP" && decision !== "NONE" ? " (obrigatória)" : ""}
              <textarea rows={2} maxLength={2000} value={justification} onChange={(event) => setJustification(event.target.value)} className={FIELD_CLASS} aria-label="Justificativa" />
            </label>
            {futureSessions.length > 0 && (
              <fieldset className="grid gap-1">
                <legend className="text-xs text-foreground/60">Sessões futuras alteradas a partir desta revisão (publique a alteração antes; aqui só fica o link)</legend>
                {futureSessions.map((session) => (
                  <label key={session.id} className="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={linked.includes(session.id)} onChange={(event) => setLinked((current) => (event.target.checked ? [...current, session.id] : current.filter((id) => id !== session.id)))} />
                    {session.label}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
              Visível para o aluno
            </label>
            <p className="text-[11px] text-foreground/50">Salvar a revisão não altera nenhum treino.</p>
            {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS}>Salvar revisão</button>
              <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => setOpen(false)}>Cancelar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
