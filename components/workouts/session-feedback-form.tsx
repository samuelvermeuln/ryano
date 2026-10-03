"use client";

/**
 * SAM-61 — the athlete's report (§19.1): done fully/partially/not, manual
 * record without a watch, RPE (when asked — scale CR10), difficulty, reason
 * of adaptation/interruption (safety is not a failure), pain (with the
 * not-an-emergency note), comment and an attachment link. Also used for an
 * unplanned activity (`activityId`).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FIELD_CLASS, PRIMARY_ACTION_CLASS } from "@/components/page-header";
import { ADAPTATION_REASON_LABELS, ADAPTATION_REASONS, COMPLETION_LABELS } from "@/modules/school/domain/execution-state";

export type SessionFeedbackValues = {
  completion: "FULL" | "PARTIAL" | "NOT_DONE" | null;
  rpe: number | null;
  difficulty: number | null;
  adaptationReason: string | null;
  adaptationNote: string | null;
  painReported: boolean;
  painNote: string | null;
  comment: string | null;
  attachmentUrl: string | null;
};

export function SessionFeedbackForm({
  assignmentId, activityId, existing, rpeRequested, hasExecution, openWater = false,
}: {
  assignmentId?: string;
  activityId?: string;
  existing: SessionFeedbackValues | null;
  rpeRequested: boolean;
  /** A matched/synced execution already exists: no manual record needed. */
  hasExecution: boolean;
  /** SAM-65 — open-water session: technical feedback (§13.6). */
  openWater?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [completion, setCompletion] = useState(existing?.completion ?? (activityId ? null : "FULL"));
  const [manual, setManual] = useState({ minutes: "", meters: "" });
  const [rpe, setRpe] = useState(existing?.rpe ? String(existing.rpe) : "");
  const [difficulty, setDifficulty] = useState(existing?.difficulty ? String(existing.difficulty) : "");
  const [reason, setReason] = useState(existing?.adaptationReason ?? "");
  const [reasonNote, setReasonNote] = useState(existing?.adaptationNote ?? "");
  const [pain, setPain] = useState(existing?.painReported ?? false);
  const [painNote, setPainNote] = useState(existing?.painNote ?? "");
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [attachment, setAttachment] = useState(existing?.attachmentUrl ?? "");
  const [technical, setTechnical] = useState({ orientation: "", environmentalDifficulty: "", confidence: "", equipment: "", observedConditions: "", feeding: "", incident: "" });
  const setTechnicalField = (key: keyof typeof technical) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTechnical((current) => ({ ...current, [key]: event.target.value }));

  const needsManual = Boolean(assignmentId) && !hasExecution && completion !== "NOT_DONE" && completion !== null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/session-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(assignmentId ? { assignmentId } : { activityId }),
          completion: activityId ? null : completion,
          rpe: rpe ? Number(rpe) : null,
          difficulty: difficulty ? Number(difficulty) : null,
          adaptationReason: reason || null,
          adaptationNote: reasonNote || null,
          painReported: pain,
          painNote: pain ? painNote : null,
          comment: comment || null,
          attachmentUrl: attachment || null,
          ...(openWater && Object.values(technical).some(Boolean)
            ? {
              openWater: {
                orientation: technical.orientation ? Number(technical.orientation) : null,
                environmentalDifficulty: technical.environmentalDifficulty ? Number(technical.environmentalDifficulty) : null,
                confidence: technical.confidence ? Number(technical.confidence) : null,
                equipment: technical.equipment || null, observedConditions: technical.observedConditions || null,
                feeding: technical.feeding || null, incident: technical.incident || null,
              },
            }
            : {}),
          ...(needsManual && (manual.minutes || manual.meters)
            ? { manual: { durationMinutes: manual.minutes ? Number(manual.minutes.replace(",", ".")) : null, distanceMeters: manual.meters ? Number(manual.meters) : null } }
            : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) { setMessage({ tone: "error", text: payload?.message ?? "Não foi possível enviar o relato." }); return; }
      setMessage({ tone: "ok", text: "Relato enviado ao seu professor." });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm" data-testid="session-feedback-form">
      {assignmentId && (
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 text-xs uppercase tracking-wide text-foreground/50">Como foi</legend>
          {(["FULL", "PARTIAL", "NOT_DONE"] as const).map((value) => (
            <label key={value} className="inline-flex items-center gap-1.5">
              <input type="radio" name="completion" checked={completion === value} onChange={() => setCompletion(value)} />
              {COMPLETION_LABELS[value]}
            </label>
          ))}
        </fieldset>
      )}
      {needsManual && (
        <div className="grid gap-2 sm:grid-cols-2" data-testid="manual-record">
          <label className="grid gap-1">Duração feita (min)<input inputMode="decimal" value={manual.minutes} onChange={(event) => setManual({ ...manual, minutes: event.target.value })} className={FIELD_CLASS} /></label>
          <label className="grid gap-1">Distância feita (m)<input inputMode="numeric" value={manual.meters} onChange={(event) => setManual({ ...manual, meters: event.target.value })} className={FIELD_CLASS} /></label>
          <p className="text-xs text-foreground/55 sm:col-span-2">Sem relógio? Registre aqui: vale como execução manual, com você como autor.</p>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">
          {rpeRequested ? "Esforço percebido (RPE 1–10, escala CR10) — pedido pelo professor" : "Esforço percebido (RPE 1–10, opcional)"}
          <input type="number" min={1} max={10} required={rpeRequested && completion !== "NOT_DONE"} value={rpe} onChange={(event) => setRpe(event.target.value)} className={FIELD_CLASS} aria-label="RPE" />
        </label>
        <label className="grid gap-1">Dificuldade (1–5)
          <input type="number" min={1} max={5} value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className={FIELD_CLASS} aria-label="Dificuldade" />
        </label>
      </div>
      {(completion === "PARTIAL" || completion === "NOT_DONE") && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1">Motivo
            <select value={reason} onChange={(event) => setReason(event.target.value)} className={FIELD_CLASS} aria-label="Motivo">
              <option value="">Sem motivo informado</option>
              {ADAPTATION_REASONS.map((value) => <option key={value} value={value}>{ADAPTATION_REASON_LABELS[value]}</option>)}
            </select>
          </label>
          <label className="grid gap-1">Detalhe do motivo
            <input value={reasonNote} maxLength={1000} onChange={(event) => setReasonNote(event.target.value)} className={FIELD_CLASS} aria-label="Detalhe do motivo" />
          </label>
        </div>
      )}
      {openWater && (
        <fieldset className="grid gap-2 sm:grid-cols-3" data-testid="open-water-feedback-fields">
          <legend className="mb-1 text-xs uppercase tracking-wide text-foreground/50">Águas abertas</legend>
          <label className="grid gap-1">Orientação (1–5)<input type="number" min={1} max={5} value={technical.orientation} onChange={setTechnicalField("orientation")} className={FIELD_CLASS} aria-label="Orientação" /></label>
          <label className="grid gap-1">Dificuldade ambiental (1–5)<input type="number" min={1} max={5} value={technical.environmentalDifficulty} onChange={setTechnicalField("environmentalDifficulty")} className={FIELD_CLASS} aria-label="Dificuldade ambiental" /></label>
          <label className="grid gap-1">Confiança (1–5)<input type="number" min={1} max={5} value={technical.confidence} onChange={setTechnicalField("confidence")} className={FIELD_CLASS} aria-label="Confiança" /></label>
          <label className="grid gap-1 sm:col-span-3">Condições observadas<input maxLength={500} value={technical.observedConditions} onChange={setTechnicalField("observedConditions")} className={FIELD_CLASS} aria-label="Condições observadas" /></label>
          <label className="grid gap-1 sm:col-span-3">Equipamento<input maxLength={500} value={technical.equipment} onChange={setTechnicalField("equipment")} className={FIELD_CLASS} aria-label="Equipamento usado" /></label>
          <label className="grid gap-1 sm:col-span-3">Alimentação<input maxLength={300} value={technical.feeding} onChange={setTechnicalField("feeding")} className={FIELD_CLASS} aria-label="Alimentação" /></label>
          <label className="grid gap-1 sm:col-span-3">Incidente ou decisão de interrupção<input maxLength={1000} value={technical.incident} onChange={setTechnicalField("incident")} className={FIELD_CLASS} aria-label="Incidente" /></label>
        </fieldset>
      )}
      <label className="inline-flex items-center gap-2">
        <input type="checkbox" checked={pain} onChange={(event) => setPain(event.target.checked)} />
        Senti dor ou uma dificuldade relevante
      </label>
      {pain && (
        <label className="grid gap-1">Descreva a dor ou dificuldade
          <textarea rows={2} maxLength={1000} required value={painNote} onChange={(event) => setPainNote(event.target.value)} className={FIELD_CLASS} aria-label="Descrição da dor" />
          <span className="text-xs text-amber-300">Seu professor será avisado. O aplicativo não é canal de emergência: em caso de urgência, procure atendimento.</span>
        </label>
      )}
      <label className="grid gap-1">Observação
        <textarea rows={2} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} className={FIELD_CLASS} aria-label="Observação" />
      </label>
      <label className="grid gap-1">Anexo (link, opcional)
        <input type="url" value={attachment} onChange={(event) => setAttachment(event.target.value)} className={FIELD_CLASS} aria-label="Link do anexo" placeholder="https://" />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS} data-testid="session-feedback-submit">Enviar relato</button>
        {message && <p role={message.tone === "error" ? "alert" : "status"} className={`text-xs ${message.tone === "error" ? "text-rose-400" : "text-foreground/70"}`}>{message.text}</p>}
      </div>
    </form>
  );
}
