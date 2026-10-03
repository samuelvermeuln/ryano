"use client";

/**
 * SAM-62 — the link between the prescribed session and the activities, for
 * the athlete and the coach (§2.2, §17.3): why it was linked, confirm, undo
 * (with a reason, nothing is deleted), redo, replace with another candidate
 * or add another file of the same session, and the trail of each action.
 */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Modal } from "@/components/modal";
import { FIELD_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { formatDistance, formatDuration } from "@/lib/format";
import type { MatchPanelModel } from "@/modules/school/presentation/match-panel-model";

type Candidate = {
  id: string;
  name: string | null;
  sportType: string;
  startedAt: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  score: number;
  otherSport: boolean;
  allowed: boolean;
  linkedHere: boolean;
  linkedElsewhere: { assignmentId: string; title: string | null } | null;
};

const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function send(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) throw new Error(payload?.message ?? "Não foi possível concluir.");
  return payload;
}

export function MatchPanel({ assignmentId, model }: { assignmentId: string; model: MatchPanelModel }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const hasActive = model.links.some((link) => link.status !== "NO_MATCH");

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setUndoing(null);
        setReason("");
        setPicking(false);
        router.refresh();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Não foi possível concluir.");
      }
    });
  }

  function openPicker() {
    setPicking(true);
    setCandidates(null);
    startTransition(async () => {
      try {
        const payload = (await send(`/api/workout-assignments/${assignmentId}/match-candidates`, { method: "GET" })) as { candidates: Candidate[] };
        setCandidates(payload.candidates);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Não foi possível listar as atividades.");
        setPicking(false);
      }
    });
  }

  const link = (activityId: string, mode: "replace" | "add") =>
    run(() => send(`/api/workout-assignments/${assignmentId}/link-activity`, { method: "POST", body: JSON.stringify({ activityId, mode }) }));

  return (
    <section className="space-y-3" data-testid="match-panel">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Atividade associada</h2>
      {model.links.length === 0 && <p className="text-xs text-foreground/55">Nenhuma atividade associada a esta sessão.</p>}
      <ul className="space-y-2">
        {model.links.map((item) => (
          <li key={item.id} className="rounded-[14px] border border-white/10 bg-white/5 p-3 text-sm" data-testid="match-link" data-status={item.status}>
            <p className="font-medium" data-testid="match-explanation">{item.explanation}</p>
            <p className="text-xs text-foreground/60">
              {item.statusLabel} · realizada em {dateTime(item.startedAt)}
              {item.durationSeconds !== null ? ` · ${formatDuration(item.durationSeconds)}` : ""}
              {item.distanceMeters !== null ? ` · ${formatDistance(item.distanceMeters)}` : ""}
              {!item.counted && item.status !== "NO_MATCH" ? " · sobreposta a outra (não somada)" : ""}
            </p>
            {item.providerRemoved && <p className="text-xs text-amber-300">Removida no provedor — o vínculo e a revisão ficam guardados para auditoria.</p>}
            {item.unlinked && (
              <p className="text-xs text-foreground/60">Desfeita em {dateTime(item.unlinked.at)}{item.unlinked.reason ? ` — ${item.unlinked.reason}` : ""}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {(item.status === "AUTO_MATCHED" || item.status === "PENDING") && (
                <button type="button" disabled={pending} className={SECONDARY_ACTION_CLASS} onClick={() => run(() => send(`/api/workout-executions/${item.id}/confirm`, { method: "POST" }))}>Confirmar</button>
              )}
              {item.status !== "NO_MATCH" && undoing !== item.id && (
                <button type="button" disabled={pending} className={SECONDARY_ACTION_CLASS} onClick={() => setUndoing(item.id)}>Desfazer</button>
              )}
              {item.status === "NO_MATCH" && item.unlinked && (
                <button type="button" disabled={pending} className={SECONDARY_ACTION_CLASS} onClick={() => run(() => send(`/api/workout-executions/${item.id}/confirm`, { method: "POST" }))}>Refazer</button>
              )}
            </div>
            {undoing === item.id && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="grid flex-1 gap-1 text-xs">Motivo (opcional)
                  <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} className={FIELD_CLASS} aria-label="Motivo de desfazer" />
                </label>
                <button type="button" disabled={pending} className={PRIMARY_ACTION_CLASS} onClick={() => run(() => send(`/api/workout-executions/${item.id}`, { method: "DELETE", body: JSON.stringify({ reason }) }))}>Confirmar desfazer</button>
                <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => setUndoing(null)}>Cancelar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {model.combined && (
        <p className="text-xs text-foreground/70" data-testid="match-combined">
          {model.combined.pieces} atividades somadas uma vez
          {model.combined.durationSeconds !== null ? ` · ${formatDuration(model.combined.durationSeconds)}` : ""}
          {model.combined.distanceMeters !== null ? ` · ${formatDistance(model.combined.distanceMeters)}` : ""}
          {model.combined.overlapping > 0 ? ` · ${model.combined.overlapping} sobreposta(s) não contada(s)` : ""}
        </p>
      )}
      <button ref={opener} type="button" disabled={pending} className={SECONDARY_ACTION_CLASS} onClick={openPicker}>
        {hasActive ? "Trocar ou somar atividade" : "Associar atividade"}
      </button>
      {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}

      {model.history.length > 0 && (
        <details className="text-xs" open>
          <summary className="cursor-pointer text-foreground/60">Histórico da associação</summary>
          <ol className="mt-1 space-y-1" data-testid="match-history">
            {model.history.map((entry) => (
              <li key={entry.id}>{dateTime(entry.at)} · {entry.label} · {entry.actorName}</li>
            ))}
          </ol>
        </details>
      )}

      {picking && (
        <Modal title="Associar atividade" onClose={() => setPicking(false)} returnFocusTo={opener} size="lg">
          {!candidates ? (
            <p className="text-sm text-foreground/60">Buscando atividades próximas da data prevista…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-foreground/60">Nenhuma atividade importada até 3 dias da data prevista.</p>
          ) : (
            <ul className="space-y-2" data-testid="match-candidates">
              {candidates.map((candidate) => (
                <li key={candidate.id} className="rounded-[14px] border border-white/10 p-3 text-sm" data-testid="match-candidate">
                  <p className="font-medium">{candidate.name ?? candidate.sportType} · {dateTime(candidate.startedAt)}</p>
                  <p className="text-xs text-foreground/60">
                    score {candidate.score}
                    {candidate.durationSeconds !== null ? ` · ${formatDuration(candidate.durationSeconds)}` : ""}
                    {candidate.distanceMeters !== null ? ` · ${formatDistance(candidate.distanceMeters)}` : ""}
                    {candidate.otherSport ? " · outra modalidade" : ""}
                    {candidate.linkedHere ? " · já associada a esta sessão" : ""}
                    {candidate.linkedElsewhere ? ` · associada a "${candidate.linkedElsewhere.title ?? "outra sessão"}" (será movida)` : ""}
                  </p>
                  {!candidate.allowed ? (
                    <p className="mt-1 text-xs text-amber-300">Outra modalidade: a substituição é decisão do professor.</p>
                  ) : !candidate.linkedHere && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" disabled={pending} className={PRIMARY_ACTION_CLASS} onClick={() => link(candidate.id, "replace")}>
                        {hasActive ? "Trocar por esta" : "Associar"}
                      </button>
                      {hasActive && (
                        <button type="button" disabled={pending} className={SECONDARY_ACTION_CLASS} onClick={() => link(candidate.id, "add")}>Somar à sessão (mesmo treino)</button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </section>
  );
}
