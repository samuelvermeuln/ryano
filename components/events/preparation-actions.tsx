"use client";

/**
 * SAM-67 — the actions of the follow-up screen (§6 steps 6–8): assume with
 * the first review date, and record the agreed goal next to the athlete's
 * wish (the wish is never overwritten).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FIELD_CLASS, PRIMARY_ACTION_CLASS } from "@/components/page-header";

async function send(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => null)) as { message?: string; details?: Array<{ message: string }> } | null;
  if (!response.ok) throw new Error(payload?.details?.[0]?.message ?? payload?.message ?? "Não foi possível concluir.");
}

export function AssumePreparationForm({ preparationId, expectedVersion }: { preparationId: string; expectedVersion: number }) {
  const router = useRouter();
  const [firstReview, setFirstReview] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-2 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-end"
      data-testid="assume-preparation"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            await send(`/api/preparations/${preparationId}`, { action: "assume", expectedVersion, firstReviewLocalDate: firstReview || null, analysisNotes: notes || null });
            router.refresh();
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Não foi possível assumir.");
          }
        });
      }}
    >
      <label className="grid gap-1">Primeira revisão<input type="date" value={firstReview} onChange={(event) => setFirstReview(event.target.value)} className={FIELD_CLASS} aria-label="Primeira revisão" /></label>
      <label className="grid gap-1">Análise inicial (opcional)<input maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className={FIELD_CLASS} aria-label="Análise inicial" /></label>
      <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS}>Assumir acompanhamento</button>
      {error && <p role="alert" className="text-xs text-rose-400 sm:col-span-3">{error}</p>}
    </form>
  );
}

export function AgreeGoalForm({ athleteId, participationId, desiredGoalId }: { athleteId: string; participationId: string; desiredGoalId: string | null }) {
  const router = useRouter();
  const [type, setType] = useState("RESULT");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-2 text-sm sm:grid-cols-[auto_1fr_auto_auto] sm:items-end"
      data-testid="agree-goal"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          try {
            await send("/api/goals", { athleteId, participationId, origin: "COACH_AGREED", desiredGoalId, type, description, dueLocalDate: due || null });
            setDescription("");
            setMessage({ tone: "ok", text: "Objetivo pactuado registrado." });
            router.refresh();
          } catch (failure) {
            setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "Não foi possível registrar." });
          }
        });
      }}
    >
      <label className="grid gap-1">Tipo
        <select value={type} onChange={(event) => setType(event.target.value)} className={FIELD_CLASS} aria-label="Tipo do objetivo">
          <option value="RESULT">Resultado</option><option value="PERFORMANCE">Desempenho</option><option value="PROCESS">Processo</option><option value="PREPARATION">Preparação</option>
        </select>
      </label>
      <label className="grid gap-1">Objetivo pactuado<input required minLength={2} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} className={FIELD_CLASS} aria-label="Objetivo pactuado" /></label>
      <label className="grid gap-1">Prazo<input type="date" value={due} onChange={(event) => setDue(event.target.value)} className={FIELD_CLASS} aria-label="Prazo do objetivo" /></label>
      <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS}>Pactuar</button>
      {message && <p role={message.tone === "error" ? "alert" : "status"} className={`text-xs sm:col-span-4 ${message.tone === "error" ? "text-rose-400" : "text-foreground/70"}`}>{message.text}</p>}
    </form>
  );
}
