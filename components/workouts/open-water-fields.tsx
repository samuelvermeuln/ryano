"use client";

/**
 * SAM-65 — the open-water part of a prescription (§13.3, §13.6, §13.8):
 * course, environment, expected conditions with provenance, responsible,
 * support and signals, equipment, local cancellation criterion, distance
 * estimate and briefing. Serialized into the hidden `openWater` field.
 * No "certificado de segurança": a solo session in an unknown place shows a
 * warning, it is not blocked.
 */
import { useEffect, useMemo, useState } from "react";

import { FIELD_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import {
  CONDITION_PROVENANCE_LABELS, CONDITION_PROVENANCES, CONDITION_VARIABLE_LABELS, CONDITION_VARIABLES,
  OPEN_WATER_ENVIRONMENT_LABELS, OPEN_WATER_ENVIRONMENTS, OPEN_WATER_SESSION_KIND_LABELS, OPEN_WATER_SESSION_KINDS,
  openWaterWarnings, type OpenWaterSession,
} from "@/modules/school/domain/open-water-session";

const EMPTY: OpenWaterSession = {
  sessionKind: null,
  course: { layout: null, laps: null, buoys: null, direction: null, visualReference: null, entryExit: null },
  environment: { kind: null, water: null, exposure: null, localNotes: null, familiarToAthlete: null },
  expectedConditions: [],
  responsiblePerson: null, supportPlan: null, communicationSignals: null, equipment: null, cancellationCriteria: null,
  solo: false,
  distance: { kind: "NONE", estimatedMeters: null },
  briefingNotes: null,
};

const orNull = (value: string) => (value.trim() === "" ? null : value);

export function OpenWaterFields({ initial, onChange }: { initial: OpenWaterSession | null; onChange?: (session: OpenWaterSession) => void }) {
  const [session, setSession] = useState<OpenWaterSession>(initial ?? EMPTY);
  const warnings = useMemo(() => openWaterWarnings(session), [session]);
  // Forms that post JSON (catalog editor) read it from here; the builder reads the hidden field.
  useEffect(() => { onChange?.(session); }, [session, onChange]);
  const set = <K extends keyof OpenWaterSession>(key: K, value: OpenWaterSession[K]) => setSession((current) => ({ ...current, [key]: value }));
  const setCourse = (patch: Partial<OpenWaterSession["course"]>) => setSession((current) => ({ ...current, course: { ...current.course, ...patch } }));
  const setEnvironment = (patch: Partial<OpenWaterSession["environment"]>) => setSession((current) => ({ ...current, environment: { ...current.environment, ...patch } }));

  return (
    <fieldset className="space-y-3 rounded-[18px] border border-white/10 p-3 text-sm" data-testid="open-water-fields">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-foreground/60">Águas abertas</legend>
      <input type="hidden" name="openWater" value={JSON.stringify(session)} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">Tipo de sessão
          <select value={session.sessionKind ?? ""} onChange={(event) => set("sessionKind", (event.target.value || null) as OpenWaterSession["sessionKind"])} className={FIELD_CLASS} aria-label="Tipo de sessão de águas abertas">
            <option value="">Não classificada</option>
            {OPEN_WATER_SESSION_KINDS.map((kind) => <option key={kind} value={kind}>{OPEN_WATER_SESSION_KIND_LABELS[kind]}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Ambiente
          <select value={session.environment.kind ?? ""} onChange={(event) => setEnvironment({ kind: (event.target.value || null) as OpenWaterSession["environment"]["kind"] })} className={FIELD_CLASS} aria-label="Ambiente">
            <option value="">Não informado</option>
            {OPEN_WATER_ENVIRONMENTS.map((kind) => <option key={kind} value={kind}>{OPEN_WATER_ENVIRONMENT_LABELS[kind]}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Percurso
          <select value={session.course.layout ?? ""} onChange={(event) => setCourse({ layout: (event.target.value || null) as OpenWaterSession["course"]["layout"] })} className={FIELD_CLASS} aria-label="Tipo de percurso">
            <option value="">Não informado</option>
            <option value="CIRCUIT">Circuito</option>
            <option value="POINT_TO_POINT">Ponto a ponto</option>
          </select>
        </label>
        <label className="grid gap-1">Voltas
          <input type="number" min={1} max={100} value={session.course.laps ?? ""} onChange={(event) => setCourse({ laps: event.target.value ? Number(event.target.value) : null })} className={FIELD_CLASS} aria-label="Voltas" />
        </label>
        <label className="grid gap-1">Boias e sentido
          <input maxLength={300} value={session.course.buoys ?? ""} onChange={(event) => setCourse({ buoys: orNull(event.target.value) })} className={FIELD_CLASS} aria-label="Boias" placeholder="3 boias amarelas" />
        </label>
        <label className="grid gap-1">Sentido
          <select value={session.course.direction ?? ""} onChange={(event) => setCourse({ direction: (event.target.value || null) as OpenWaterSession["course"]["direction"] })} className={FIELD_CLASS} aria-label="Sentido">
            <option value="">Não informado</option>
            <option value="CLOCKWISE">Horário</option>
            <option value="COUNTERCLOCKWISE">Anti-horário</option>
          </select>
        </label>
        <label className="grid gap-1">Referência visual
          <input maxLength={300} value={session.course.visualReference ?? ""} onChange={(event) => setCourse({ visualReference: orNull(event.target.value) })} className={FIELD_CLASS} aria-label="Referência visual" />
        </label>
        <label className="grid gap-1">Entrada e saída
          <input maxLength={300} value={session.course.entryExit ?? ""} onChange={(event) => setCourse({ entryExit: orNull(event.target.value) })} className={FIELD_CLASS} aria-label="Entrada e saída" />
        </label>
        <label className="grid gap-1">Responsável pela sessão
          <input maxLength={200} value={session.responsiblePerson ?? ""} onChange={(event) => set("responsiblePerson", orNull(event.target.value))} className={FIELD_CLASS} aria-label="Responsável pela sessão" />
        </label>
        <label className="grid gap-1">Plano de apoio
          <input maxLength={1000} value={session.supportPlan ?? ""} onChange={(event) => set("supportPlan", orNull(event.target.value))} className={FIELD_CLASS} aria-label="Plano de apoio" />
        </label>
        <label className="grid gap-1">Comunicação (sinais)
          <input maxLength={500} value={session.communicationSignals ?? ""} onChange={(event) => set("communicationSignals", orNull(event.target.value))} className={FIELD_CLASS} aria-label="Sinais de comunicação" />
        </label>
        <label className="grid gap-1">Equipamento
          <input maxLength={500} value={session.equipment ?? ""} onChange={(event) => set("equipment", orNull(event.target.value))} className={FIELD_CLASS} aria-label="Equipamento" />
        </label>
        <label className="grid gap-1 sm:col-span-2">Critério local de cancelamento
          <input maxLength={1000} value={session.cancellationCriteria ?? ""} onChange={(event) => set("cancellationCriteria", orNull(event.target.value))} className={FIELD_CLASS} aria-label="Critério de cancelamento" />
        </label>
        <label className="grid gap-1">Distância
          <select value={session.distance.kind} onChange={(event) => set("distance", { ...session.distance, kind: event.target.value as "ESTIMATED" | "NONE" })} className={FIELD_CLASS} aria-label="Distância prevista">
            <option value="NONE">Sem previsão (sessão por tempo)</option>
            <option value="ESTIMATED">Estimada</option>
          </select>
        </label>
        {session.distance.kind === "ESTIMATED" && (
          <label className="grid gap-1">Estimativa (m)
            <input type="number" min={1} value={session.distance.estimatedMeters ?? ""} onChange={(event) => set("distance", { ...session.distance, estimatedMeters: event.target.value ? Number(event.target.value) : null })} className={FIELD_CLASS} aria-label="Distância estimada" />
          </label>
        )}
        <label className="grid gap-1 sm:col-span-2">Briefing e conferência de entrada/saída (fora do tempo aquático)
          <input maxLength={1000} value={session.briefingNotes ?? ""} onChange={(event) => set("briefingNotes", orNull(event.target.value))} className={FIELD_CLASS} aria-label="Briefing" />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-xs">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={session.environment.familiarToAthlete === true} onChange={(event) => setEnvironment({ familiarToAthlete: event.target.checked })} />O aluno já conhece este local</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={session.solo} onChange={(event) => set("solo", event.target.checked)} />Sessão sem supervisão no local</label>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-foreground/60">Condições previstas (sempre com a origem; desconhecido fica em branco)</p>
        {session.expectedConditions.map((condition, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-4">
            <select value={condition.variable} onChange={(event) => set("expectedConditions", session.expectedConditions.map((item, i) => (i === index ? { ...item, variable: event.target.value as typeof item.variable } : item)))} className={FIELD_CLASS} aria-label="Variável">
              {CONDITION_VARIABLES.map((variable) => <option key={variable} value={variable}>{CONDITION_VARIABLE_LABELS[variable]}</option>)}
            </select>
            <input value={condition.value} maxLength={80} onChange={(event) => set("expectedConditions", session.expectedConditions.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))} className={FIELD_CLASS} aria-label="Valor" />
            <select value={condition.provenance} onChange={(event) => set("expectedConditions", session.expectedConditions.map((item, i) => (i === index ? { ...item, provenance: event.target.value as typeof item.provenance } : item)))} className={FIELD_CLASS} aria-label="Origem">
              {CONDITION_PROVENANCES.map((provenance) => <option key={provenance} value={provenance}>{CONDITION_PROVENANCE_LABELS[provenance]}</option>)}
            </select>
            <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => set("expectedConditions", session.expectedConditions.filter((_, i) => i !== index))}>Remover</button>
          </div>
        ))}
        {session.expectedConditions.length < 10 && (
          <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => set("expectedConditions", [...session.expectedConditions, { variable: "WIND", value: "", provenance: "FORECAST", source: null, place: null, at: null }])}>Adicionar condição</button>
        )}
      </div>
      {warnings.length > 0 && (
        <ul className="text-xs text-amber-300" data-testid="open-water-builder-warnings">
          {warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </fieldset>
  );
}
