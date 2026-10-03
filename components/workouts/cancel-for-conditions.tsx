"use client";

/**
 * SAM-65 — §13.8: the coach cancels an open-water session because of the
 * conditions; the justification is kept in the prescription's history. It is
 * a decision, never a "falta" of the athlete.
 */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Modal } from "@/components/modal";
import { FIELD_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";

export function CancelForConditions({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/workout-assignments/${assignmentId}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: `Cancelada por condições: ${reason.trim()}` }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) { setError(payload?.message ?? "Não foi possível cancelar."); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button ref={opener} type="button" className={SECONDARY_ACTION_CLASS} onClick={() => setOpen(true)}>Cancelar por condições</button>
      {open && (
        <Modal title="Cancelar por condições" onClose={() => setOpen(false)} returnFocusTo={opener}>
          <form onSubmit={submit} className="space-y-3 text-sm">
            <label className="grid gap-1">O que foi observado (fica no histórico)
              <textarea required minLength={3} maxLength={1500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className={FIELD_CLASS} aria-label="Justificativa do cancelamento" />
            </label>
            <p className="text-[11px] text-foreground/50">Cancelar por segurança é uma decisão, não uma falta do aluno.</p>
            {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS}>Confirmar cancelamento</button>
              <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => setOpen(false)}>Voltar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
