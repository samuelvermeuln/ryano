"use client";

/** SAM-58 — per-template actions in the catalog list: favourite, duplicate, variant, archive and "Usar este modelo". */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FIELD_CLASS } from "@/components/page-header";

export function TemplateActions({
  templateId, favorite, archived, canEdit, athletes,
}: {
  templateId: string;
  favorite: boolean;
  archived: boolean;
  canEdit: boolean;
  /** Where "Usar este modelo" may go: the coach's athletes allowed for this template's scope. */
  athletes: Array<{ label: string; href: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState("");

  function call(url: string, method: string, body?: unknown, then?: (payload: { template?: { id: string } }) => void) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const payload = (await response.json().catch(() => null)) as { template?: { id: string }; message?: string } | null;
      if (!response.ok) { setError(payload?.message ?? "Não foi possível concluir."); return; }
      if (then && payload) then(payload);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" disabled={pending} onClick={() => call(`/api/workout-catalog/${templateId}/favorite`, favorite ? "DELETE" : "PUT")} className="rounded-full border border-white/12 px-3 py-1.5" aria-pressed={favorite}>
          {favorite ? "★ Favorito" : "☆ Favoritar"}
        </button>
        <button type="button" disabled={pending} onClick={() => call(`/api/workout-catalog/${templateId}/duplicate`, "POST", {}, (payload) => router.push(`/professor/estudio/treinos/${payload.template!.id}`))} className="rounded-full border border-white/12 px-3 py-1.5">
          Duplicar
        </button>
        <button type="button" disabled={pending} onClick={() => call(`/api/workout-catalog/${templateId}/duplicate`, "POST", { variant: true }, (payload) => router.push(`/professor/estudio/treinos/${payload.template!.id}`))} className="rounded-full border border-white/12 px-3 py-1.5">
          Criar variante
        </button>
        {canEdit && !archived && (
          <button type="button" disabled={pending} onClick={() => call(`/api/workout-catalog/${templateId}/archive`, "POST")} className="rounded-full border border-white/12 px-3 py-1.5 text-rose-300">
            Arquivar
          </button>
        )}
      </div>
      {!archived && athletes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select aria-label="Atleta para usar o modelo" value={target} onChange={(event) => setTarget(event.target.value)} className={`${FIELD_CLASS} w-auto py-1.5`}>
            <option value="">Usar este modelo para…</option>
            {athletes.map((athlete) => <option key={athlete.href} value={athlete.href}>{athlete.label}</option>)}
          </select>
          <button type="button" disabled={!target} onClick={() => router.push(target)} className="glass-button rounded-full px-3 py-1.5 font-semibold">
            Usar este modelo
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
