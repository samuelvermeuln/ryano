"use client";

/**
 * SAM-75 — §17.3: select a trecho of the file (start → end, in seconds from
 * the start), optionally for one of the athlete's prescriptions. The server
 * refuses any overlap, so no second counts twice.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FIELD_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { SEGMENT_KINDS, SEGMENT_LABELS } from "@/modules/shared/activities/domain/multisport";

export function SegmentSelectionForm({ activityId, durationSeconds, sessions }: { activityId: string; durationSeconds: number; sessions: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState(String(durationSeconds));
  const [kind, setKind] = useState("OTHER");
  const [label, setLabel] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-2 text-sm sm:grid-cols-3"
      data-testid="segment-selection"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const response = await fetch(`/api/activities/${activityId}/segments`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ startOffsetSeconds: Number(start), endOffsetSeconds: Number(end), kind, label: label || null, workoutAssignmentId: assignmentId || null }),
          });
          const payload = (await response.json().catch(() => null)) as { message?: string; details?: Array<{ message: string }> } | null;
          if (!response.ok) { setMessage({ tone: "error", text: payload?.details?.[0]?.message ?? payload?.message ?? "Não foi possível marcar o trecho." }); return; }
          setMessage({ tone: "ok", text: "Trecho marcado." });
          router.refresh();
        });
      }}
    >
      <label className="grid gap-1">Início (s)<input type="number" min={0} max={durationSeconds} value={start} onChange={(event) => setStart(event.target.value)} className={FIELD_CLASS} aria-label="Início do trecho em segundos" /></label>
      <label className="grid gap-1">Fim (s)<input type="number" min={1} max={durationSeconds} value={end} onChange={(event) => setEnd(event.target.value)} className={FIELD_CLASS} aria-label="Fim do trecho em segundos" /></label>
      <label className="grid gap-1">Tipo
        <select value={kind} onChange={(event) => setKind(event.target.value)} className={FIELD_CLASS} aria-label="Tipo do trecho">
          {SEGMENT_KINDS.map((value) => <option key={value} value={value}>{SEGMENT_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Nome (opcional)<input maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} className={FIELD_CLASS} aria-label="Nome do trecho" /></label>
      {sessions.length > 0 && (
        <label className="grid gap-1 sm:col-span-2">Responde à prescrição
          <select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} className={FIELD_CLASS} aria-label="Prescrição do trecho">
            <option value="">Nenhuma</option>
            {sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
          </select>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <button type="submit" disabled={pending} className={SECONDARY_ACTION_CLASS}>Marcar trecho</button>
        {message && <span role={message.tone === "error" ? "alert" : "status"} className={`text-xs ${message.tone === "error" ? "text-rose-400" : "text-emerald-500"}`}>{message.text}</span>}
      </div>
    </form>
  );
}
