"use client";

/**
 * SAM-66 — §6 step 13: after the result and the post-event review, the coach
 * closes the preparation (CLOSED with history) — or keeps it open with a next
 * review set in the review itself.
 */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Modal } from "@/components/modal";
import { FIELD_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";

export function ClosePreparationButton({ preparationId, expectedVersion }: { preparationId: string; expectedVersion: number }) {
  const router = useRouter();
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Evento concluído e revisado");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/preparations/${preparationId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "close", expectedVersion, reason }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) { setError(payload?.message ?? "Não foi possível encerrar."); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button ref={opener} type="button" className={SECONDARY_ACTION_CLASS} onClick={() => setOpen(true)}>Encerrar preparação</button>
      {open && (
        <Modal title="Encerrar preparação" onClose={() => setOpen(false)} returnFocusTo={opener}>
          <form onSubmit={submit} className="space-y-3 text-sm">
            <label className="grid gap-1">Motivo (fica no histórico)
              <input required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className={FIELD_CLASS} aria-label="Motivo do encerramento" />
            </label>
            {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS}>Confirmar encerramento</button>
              <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => setOpen(false)}>Voltar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
