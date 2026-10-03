"use client";

/**
 * SAM-66 — recording the result of a prova (§12.6): status, official time
 * with its origin and reported time, placement/category, splits or segments
 * and transitions, abandon segment and reason, feeding, strategy, day
 * conditions, official link and — for the athlete only — their perception.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FIELD_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { formatResultTime, parseDurationText, RESULT_STATUS_LABELS, RESULT_STATUSES, type ResultStatus } from "@/modules/school/domain/participation-result";
import type { ResultView } from "./participation-result-summary";

type SplitDraft = { label: string; time: string; kind: "SEGMENT" | "TRANSITION" | "SPLIT" | "REACTION" };

export function ParticipationResultForm({ participationId, existing, audience }: { participationId: string; existing: ResultView | null; audience: "athlete" | "coach" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [status, setStatus] = useState<ResultStatus>((existing?.status as ResultStatus) ?? "FINISHED");
  const [official, setOfficial] = useState(existing?.officialTimeSeconds ? formatResultTime(existing.officialTimeSeconds) : "");
  const [officialSource, setOfficialSource] = useState(existing?.officialTimeSource ?? "");
  const [reported, setReported] = useState(existing?.reportedTimeSeconds ? formatResultTime(existing.reportedTimeSeconds) : "");
  const [placement, setPlacement] = useState(existing?.placement ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [splits, setSplits] = useState<SplitDraft[]>(() => (Array.isArray(existing?.splits) ? (existing!.splits as Array<{ label: string; seconds: number; kind: SplitDraft["kind"] }>).map((split) => ({ label: split.label, time: formatResultTime(split.seconds), kind: split.kind })) : []));
  const [abandonSegment, setAbandonSegment] = useState(existing?.abandonSegment ?? "");
  const [abandonReason, setAbandonReason] = useState(existing?.abandonReason ?? "");
  const [feeding, setFeeding] = useState(existing?.feedingReport ?? "");
  const [strategy, setStrategy] = useState(existing?.strategyExecution ?? "");
  const [conditions, setConditions] = useState(existing?.dayConditions ?? "");
  const [url, setUrl] = useState(existing?.officialResultUrl ?? "");
  const [perception, setPerception] = useState(existing?.athletePerception ?? "");
  const finished = status === "FINISHED" || status === "DSQ";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/events/participations/${participationId}/result`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          officialTimeSeconds: finished ? parseDurationText(official) : null,
          officialTimeSource: finished && official ? officialSource || null : null,
          reportedTimeSeconds: finished ? parseDurationText(reported) : null,
          placement: placement || null, category: category || null,
          splits: splits.filter((split) => split.label && parseDurationText(split.time) !== null).map((split) => ({ label: split.label, seconds: parseDurationText(split.time), kind: split.kind })),
          abandonSegment: status === "DNF" ? abandonSegment || null : null,
          abandonReason: status === "DNF" ? abandonReason || null : null,
          feedingReport: feeding || null, strategyExecution: strategy || null, dayConditions: conditions || null,
          officialResultUrl: url || null,
          ...(audience === "athlete" ? { athletePerception: perception || null } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; details?: Array<{ message: string }> } | null;
      if (!response.ok) { setMessage({ tone: "error", text: payload?.details?.[0]?.message ?? payload?.message ?? "Não foi possível salvar o resultado." }); return; }
      setMessage({ tone: "ok", text: "Resultado salvo." });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm" data-testid="participation-result-form">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">Situação
          <select value={status} onChange={(event) => setStatus(event.target.value as ResultStatus)} className={FIELD_CLASS} aria-label="Situação do resultado">
            {RESULT_STATUSES.map((value) => <option key={value} value={value}>{RESULT_STATUS_LABELS[value]}</option>)}
          </select>
        </label>
        {finished && (
          <>
            <label className="grid gap-1">Tempo relatado (h:mm:ss)<input value={reported} onChange={(event) => setReported(event.target.value)} className={FIELD_CLASS} aria-label="Tempo relatado" placeholder="1:02:30" /></label>
            <label className="grid gap-1">Tempo oficial (h:mm:ss)<input value={official} onChange={(event) => setOfficial(event.target.value)} className={FIELD_CLASS} aria-label="Tempo oficial" /></label>
            <label className="grid gap-1">Origem do tempo oficial<input maxLength={200} value={officialSource} onChange={(event) => setOfficialSource(event.target.value)} className={FIELD_CLASS} aria-label="Origem do tempo oficial" placeholder="Resultado publicado pelo organizador" /></label>
          </>
        )}
        <label className="grid gap-1">Classificação<input maxLength={120} value={placement} onChange={(event) => setPlacement(event.target.value)} className={FIELD_CLASS} aria-label="Classificação" /></label>
        <label className="grid gap-1">Categoria<input maxLength={120} value={category} onChange={(event) => setCategory(event.target.value)} className={FIELD_CLASS} aria-label="Categoria" /></label>
        {status === "DNF" && (
          <>
            <label className="grid gap-1">Segmento do abandono<input maxLength={120} value={abandonSegment} onChange={(event) => setAbandonSegment(event.target.value)} className={FIELD_CLASS} aria-label="Segmento do abandono" placeholder="Corrida, após a bike" /></label>
            <label className="grid gap-1">Motivo do abandono<input maxLength={1000} value={abandonReason} onChange={(event) => setAbandonReason(event.target.value)} className={FIELD_CLASS} aria-label="Motivo do abandono" /></label>
          </>
        )}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs text-foreground/60">Parciais, segmentos e transições</legend>
        {splits.map((split, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-4">
            <input value={split.label} maxLength={60} onChange={(event) => setSplits((current) => current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))} className={FIELD_CLASS} aria-label="Nome da parcial" placeholder="Natação, T1, 100 m…" />
            <input value={split.time} onChange={(event) => setSplits((current) => current.map((item, i) => (i === index ? { ...item, time: event.target.value } : item)))} className={FIELD_CLASS} aria-label="Tempo da parcial" placeholder="mm:ss" />
            <select value={split.kind} onChange={(event) => setSplits((current) => current.map((item, i) => (i === index ? { ...item, kind: event.target.value as SplitDraft["kind"] } : item)))} className={FIELD_CLASS} aria-label="Tipo da parcial">
              <option value="SPLIT">Parcial</option><option value="SEGMENT">Segmento</option><option value="TRANSITION">Transição</option><option value="REACTION">Reação/saída</option>
            </select>
            <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => setSplits((current) => current.filter((_, i) => i !== index))}>Remover</button>
          </div>
        ))}
        <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => setSplits((current) => [...current, { label: "", time: "", kind: "SPLIT" }])}>Adicionar parcial</button>
      </fieldset>
      <div className="grid gap-2">
        <label className="grid gap-1">Alimentação relatada<input maxLength={1000} value={feeding} onChange={(event) => setFeeding(event.target.value)} className={FIELD_CLASS} aria-label="Alimentação" /></label>
        <label className="grid gap-1">Execução da estratégia<textarea rows={2} maxLength={2000} value={strategy} onChange={(event) => setStrategy(event.target.value)} className={FIELD_CLASS} aria-label="Execução da estratégia" /></label>
        <label className="grid gap-1">Condições do dia<input maxLength={1000} value={conditions} onChange={(event) => setConditions(event.target.value)} className={FIELD_CLASS} aria-label="Condições do dia" /></label>
        <label className="grid gap-1">Link do resultado oficial<input type="url" maxLength={500} value={url} onChange={(event) => setUrl(event.target.value)} className={FIELD_CLASS} aria-label="Link do resultado oficial" placeholder="https://" /></label>
        {audience === "athlete" && (
          <label className="grid gap-1">Sua percepção<textarea rows={2} maxLength={2000} value={perception} onChange={(event) => setPerception(event.target.value)} className={FIELD_CLASS} aria-label="Sua percepção" /></label>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS}>Salvar resultado</button>
        {message && <p role={message.tone === "error" ? "alert" : "status"} className={`text-xs ${message.tone === "error" ? "text-rose-400" : "text-foreground/70"}`}>{message.text}</p>}
      </div>
    </form>
  );
}
