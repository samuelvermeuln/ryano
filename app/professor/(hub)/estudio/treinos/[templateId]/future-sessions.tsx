"use client";

/**
 * SAM-60 — "Atualizar sessões futuras" (§9.4): an explicit, separate action.
 * Lists the coach's future, not executed sessions made from an older version;
 * nothing changes until the coach selects sessions and confirms. Each chosen
 * session gets a new version (the old one stays readable — SAM-59).
 */
import { useEffect, useState, useTransition } from "react";

import { FIELD_CLASS, ITEM_CLASS, PRIMARY_ACTION_CLASS } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";

type Session = { assignmentId: string; athleteName: string | null; scheduledAt: string; fromVersion: number | null; title: string | null };

export function FutureSessions({ templateId, diffLines }: { templateId: string; diffLines: string[] }) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<{ currentVersion: number | null; sessions: Session[] } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = () => fetch(`/api/workout-catalog/${templateId}/future-sessions`).then((response) => response.json()).then(setData).catch(() => setData({ currentVersion: null, sessions: [] }));
  useEffect(() => { void load(); }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || data.sessions.length === 0) return null;
  return (
    <SectionCard title={`Sessões futuras com versão anterior (${data.sessions.length})`} description={`Escolha quais passam para a versão ${data.currentVersion}. Sessões já realizadas nunca mudam.`}>
      {diffLines.length > 0 && (
        <ul className="mb-3 space-y-0.5 text-xs text-foreground/70" data-testid="future-sessions-diff">
          {diffLines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      <ul className="space-y-1.5" data-testid="future-sessions">
        {data.sessions.map((session) => (
          <li key={session.assignmentId} className={`${ITEM_CLASS} text-sm`}>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(session.assignmentId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, session.assignmentId] : current.filter((id) => id !== session.assignmentId))} />
              {session.athleteName ?? "Atleta"} · {new Date(session.scheduledAt).toLocaleString("pt-BR")} · versão {session.fromVersion ?? "?"}
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo (opcional)" aria-label="Motivo da atualização" className={`${FIELD_CLASS} sm:w-80`} />
        <button
          type="button"
          disabled={pending || selected.length === 0}
          className={PRIMARY_ACTION_CLASS}
          onClick={() => startTransition(async () => {
            const response = await fetch(`/api/workout-catalog/${templateId}/future-sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assignmentIds: selected, reason: reason || null }) });
            const payload = (await response.json().catch(() => null)) as { results?: Array<{ status: string }>; message?: string } | null;
            const ok = payload?.results?.filter((item) => item.status === "OK").length ?? 0;
            const failed = (payload?.results?.length ?? 0) - ok;
            setMessage(response.ok ? `${ok} atualizada(s)${failed ? `, ${failed} com falha` : ""}.` : payload?.message ?? "Não foi possível atualizar.");
            setSelected([]);
            await load();
          })}
        >
          Atualizar {selected.length} selecionada(s)
        </button>
      </div>
      {message && <p role="status" className="mt-2 text-xs text-foreground/70">{message}</p>}
    </SectionCard>
  );
}
