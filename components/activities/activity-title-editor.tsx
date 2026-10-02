"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IconCheck, IconPencil, IconX } from "@tabler/icons-react";

import { renameActivityTitleAction } from "@/app/actions/activities";

/**
 * SAM-40 — the activity title as the athlete sees it: a heading with an
 * inline edit (only the owner gets this component; readers get a plain h1).
 */
export function ActivityTitleEditor({ activityId, title, editorialTitle }: { activityId: string; title: string; editorialTitle: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editorialTitle ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await renameActivityTitleAction({ activityId, title: draft });
      setMessage(result.message ?? null);
      if (result.success) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2.2rem]" data-testid="activity-title">{title}</h1>
        <button
          type="button"
          onClick={() => { setDraft(editorialTitle ?? ""); setMessage(null); setEditing(true); }}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-foreground/70 hover:text-foreground"
          aria-label="Editar título da atividade"
        >
          <IconPencil size={14} /> Renomear
        </button>
        {message && <span className="text-xs text-foreground/60" role="status">{message}</span>}
      </div>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => { event.preventDefault(); save(); }}
    >
      <label className="sr-only" htmlFor={`activity-title-${activityId}`}>Título da atividade</label>
      <input
        id={`activity-title-${activityId}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={120}
        placeholder={title}
        autoFocus
        className="w-full max-w-md rounded-xl border border-border bg-transparent px-3 py-2 text-lg font-semibold text-foreground outline-none focus:ring-2 focus:ring-sky-400/50"
      />
      <button type="submit" disabled={pending} className="inline-flex items-center gap-1 rounded-full theme-pill-success px-3 py-1 text-xs font-medium disabled:opacity-60">
        <IconCheck size={14} /> {pending ? "Salvando…" : "Salvar"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-foreground/70">
        <IconX size={14} /> Cancelar
      </button>
      {message && <span className="text-xs text-foreground/60" role="status">{message}</span>}
    </form>
  );
}
