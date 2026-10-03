"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  assignmentId: string;
  /** Not read here; the independent detail (SAM-30) has no school. */
  schoolId?: string;
};

type ExportNote = { block: number; kind: "omitted" | "converted"; item: string; reason: string };

/**
 * SAM-49 — "send to watch" first shows what the watch will NOT receive as
 * prescribed (§11.4): omitted targets, repetitions sent as a sequence, a
 * shortened title. The athlete confirms knowing it; nothing is presented as a
 * faithful copy when it is not.
 */
export function PushToWatchButton({ assignmentId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "review" | "success" | "error">("idle");
  const [notes, setNotes] = useState<ExportNote[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const endpoint = `/api/workout-assignments/${assignmentId}/push-to-watch`;

  async function preview() {
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch(endpoint);
      const data = await res.json() as { error?: string; notes?: ExportNote[] };
      if (!res.ok) {
        setErrorMsg(data.error ?? "Erro ao preparar o envio");
        setState("error");
        return;
      }
      const found = data.notes ?? [];
      setNotes(found);
      if (found.length === 0) await push();
      else setState("review");
    } catch {
      setErrorMsg("Erro de conexão");
      setState("error");
    }
  }

  async function push() {
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json() as { error?: string; message?: string; notes?: ExportNote[] };
      if (!res.ok) {
        setErrorMsg(data.message ?? data.error ?? "Erro ao enviar");
        setState("error");
        return;
      }
      if (data.notes) setNotes(data.notes);
      setState("success");
      router.refresh();
    } catch {
      setErrorMsg("Erro de conexão");
      setState("error");
    }
  }

  const noteList = notes.length > 0 && (
    <ul className="space-y-1 text-xs text-foreground/70" data-testid="watch-export-notes">
      {notes.map((note, index) => (
        <li key={`${note.block}-${note.item}-${index}`} data-kind={note.kind}>
          <span className="font-semibold">{note.block > 0 ? `Bloco ${note.block} · ` : ""}{note.item}</span>
          {" — "}{note.kind === "omitted" ? "não enviado" : "convertido"}: {note.reason}
        </li>
      ))}
    </ul>
  );

  if (state === "success") {
    return (
      <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-xs text-emerald-400" data-testid="watch-export-success">
        <p>✓ Treino enviado ao relógio. Sincronize o dispositivo para ver.</p>
        {noteList}
      </div>
    );
  }

  if (state === "review") {
    return (
      <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3" data-testid="watch-export-review">
        <p className="text-sm font-medium text-foreground">O relógio não vai receber o treino exatamente como prescrito:</p>
        {noteList}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void push()} className="glass-button-primary rounded-full px-4 py-2 text-xs font-semibold">
            Enviar mesmo assim
          </button>
          <button type="button" onClick={() => setState("idle")} className="glass-button rounded-full px-4 py-2 text-xs font-medium text-foreground">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => void preview()}
        disabled={state === "loading"}
        className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm font-medium px-4 py-2.5 hover:bg-primary/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "loading" ? (
          <>
            <span className="animate-spin">⟳</span>
            Preparando envio…
          </>
        ) : (
          <>
            <span>⌚</span>
            Enviar ao relógio
          </>
        )}
      </button>
      {state === "error" && errorMsg && (
        <p role="alert" className="text-xs text-destructive">{errorMsg}</p>
      )}
    </div>
  );
}
