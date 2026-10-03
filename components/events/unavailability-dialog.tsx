"use client";

/** SAM-57 — the athlete records an unavailability period (travel, work…) shown on the calendar. */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Modal } from "@/components/modal";
import { FIELD_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";

export function UnavailabilityDialog() {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ startLocalDate: "", endLocalDate: "", reason: "" });

  return (
    <>
      <button ref={trigger} type="button" onClick={() => { setError(null); setOpen(true); }} className={SECONDARY_ACTION_CLASS} data-testid="unavailability-button">
        Indisponibilidade
      </button>
      {open && (
        <Modal title="Registrar indisponibilidade" onClose={() => setOpen(false)} returnFocusTo={trigger}>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const response = await fetch("/api/unavailability", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
                if (!response.ok) {
                  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
                  setError(payload?.message ?? "Não foi possível registrar.");
                  return;
                }
                setOpen(false);
                setForm({ startLocalDate: "", endLocalDate: "", reason: "" });
                router.refresh();
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Início<input type="date" required value={form.startLocalDate} onChange={(event) => setForm({ ...form, startLocalDate: event.target.value })} className={FIELD_CLASS} /></label>
              <label className="grid gap-1 text-sm">Fim<input type="date" required value={form.endLocalDate} onChange={(event) => setForm({ ...form, endLocalDate: event.target.value })} className={FIELD_CLASS} /></label>
            </div>
            <label className="grid gap-1 text-sm">Motivo<input required minLength={2} maxLength={200} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className={FIELD_CLASS} placeholder="Ex.: viagem a trabalho" /></label>
            <p className="text-xs text-foreground/55">Seu professor vê o período; nenhum treino é alterado automaticamente.</p>
            {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => setOpen(false)}>Cancelar</button>
              <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS}>Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
