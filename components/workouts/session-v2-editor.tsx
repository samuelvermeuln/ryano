"use client";

/**
 * SAM-69 — the session builder v2 (§11): named blocks with steps and nested
 * sets, rest by position (standing/active, counted or not), send-off
 * intervals, manual end, combined intensity, pool length and unit, and the
 * live totals (effort / recovery / total — exact or estimated) with the
 * title × sum check. Same component in the prescription builder and in the
 * catalog editor; serialized into the hidden `sessionV2` field and reported
 * through `onChange`.
 */
import { useEffect, useMemo, useState } from "react";

import { FIELD_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import {
  sessionContentV2Schema, sessionTotals, titleDivergence, V2_BLOCK_TYPE_LABELS, V2_BLOCK_TYPES,
  type SessionContentV2, type SessionSet, type SessionStep,
} from "@/modules/school/domain/session-content-v2";

type Node = SessionStep | SessionSet;
type Path = number[];

const newStep = (): SessionStep => ({
  kind: "STEP", name: null, duration: { type: "TIME", seconds: 300 }, intensity: { primary: null, secondary: [] },
  notes: null, swim: null, bike: null, run: null, strength: null, drill: null,
});
const newSet = (): SessionSet => ({ kind: "SET", name: null, repetitions: 4, children: [newStep()], rest: { position: "BETWEEN_REPS", seconds: 30, active: false, countsInTotal: true }, sendOffSeconds: null });
const formatSeconds = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
};

function updateAt(nodes: Node[], path: Path, change: (node: Node) => Node | null): Node[] {
  const [index, ...rest] = path;
  return nodes.flatMap((node, position) => {
    if (position !== index) return [node];
    if (rest.length === 0) {
      const next = change(node);
      return next ? [next] : [];
    }
    if (node.kind !== "SET") return [node];
    return [{ ...node, children: updateAt(node.children, rest, change) }];
  });
}

function StepEditor({ step, unit, onChange, onRemove, label }: { step: SessionStep; unit: string; onChange: (step: SessionStep) => void; onRemove: () => void; label: string }) {
  const value = step.duration.type === "TIME" ? Math.round(step.duration.seconds / 60 * 100) / 100 : step.duration.type === "DISTANCE" ? step.duration.value : "";
  const primary = step.intensity.primary;
  return (
    <div className="grid gap-2 rounded-[12px] border border-white/10 p-2 sm:grid-cols-[1fr_auto_auto_1fr_auto]" data-testid="v2-step">
      <input value={step.name ?? ""} placeholder="Nome do passo" maxLength={120} onChange={(event) => onChange({ ...step, name: event.target.value || null })} className={FIELD_CLASS} aria-label={`Nome ${label}`} />
      <select value={step.duration.type} onChange={(event) => {
        const type = event.target.value as "TIME" | "DISTANCE" | "MANUAL";
        onChange({ ...step, duration: type === "TIME" ? { type, seconds: 300 } : type === "DISTANCE" ? { type, value: 100 } : { type } });
      }} className={FIELD_CLASS} aria-label={`Duração ${label}`}>
        <option value="TIME">Tempo (min)</option><option value="DISTANCE">Distância ({unit})</option><option value="MANUAL">Término manual</option>
      </select>
      {step.duration.type !== "MANUAL" ? (
        <input type="number" min={0} step="any" value={value} onChange={(event) => {
          const number = Number(event.target.value);
          onChange({ ...step, duration: step.duration.type === "TIME" ? { type: "TIME", seconds: Math.max(1, Math.round(number * 60)) } : { type: "DISTANCE", value: Math.max(1, number) } });
        }} className={`${FIELD_CLASS} w-24`} aria-label={`Valor ${label}`} />
      ) : <span className="self-center text-xs text-foreground/55">aberto</span>}
      <input value={primary?.kind === "TEXT" ? primary.text ?? "" : ""} placeholder="Intensidade (texto, RPE, zona…)" maxLength={300}
        onChange={(event) => onChange({ ...step, intensity: { ...step.intensity, primary: event.target.value ? { kind: "TEXT", text: event.target.value, min: null, max: null, relative: false } : null } })}
        className={FIELD_CLASS} aria-label={`Intensidade ${label}`} />
      <button type="button" className={SECONDARY_ACTION_CLASS} onClick={onRemove} aria-label={`Remover ${label}`}>×</button>
    </div>
  );
}

function NodesEditor({ nodes, unit, onChange, depth, label }: { nodes: Node[]; unit: string; onChange: (nodes: Node[]) => void; depth: number; label: string }) {
  return (
    <div className="space-y-2">
      {nodes.map((node, index) => {
        const itemLabel = `${label}.${index + 1}`;
        const set = (patch: (node: Node) => Node | null) => onChange(updateAt(nodes, [index], patch));
        if (node.kind === "STEP") {
          return <StepEditor key={index} step={node} unit={unit} label={itemLabel} onChange={(step) => set(() => step)} onRemove={() => set(() => null)} />;
        }
        return (
          <div key={index} className="space-y-2 rounded-[12px] border border-primary/20 p-2" data-testid="v2-set">
            <div className="flex flex-wrap items-end gap-2 text-xs">
              <label className="grid gap-1">Repetições<input type="number" min={1} max={200} value={node.repetitions} onChange={(event) => set(() => ({ ...node, repetitions: Math.max(1, Number(event.target.value) || 1) }))} className={`${FIELD_CLASS} w-20`} aria-label={`Repetições ${itemLabel}`} /></label>
              <label className="grid gap-1">Descanso (s)<input type="number" min={0} value={node.rest?.seconds ?? ""} placeholder="completa" onChange={(event) => set(() => ({ ...node, rest: event.target.value === "" ? null : { position: node.rest?.position ?? "BETWEEN_REPS", seconds: Number(event.target.value) || null, active: node.rest?.active ?? false, countsInTotal: node.rest?.countsInTotal ?? true } }))} className={`${FIELD_CLASS} w-24`} aria-label={`Descanso ${itemLabel}`} /></label>
              <label className="grid gap-1">Posição
                <select value={node.rest?.position ?? "BETWEEN_REPS"} onChange={(event) => set(() => ({ ...node, rest: { position: event.target.value as "BETWEEN_REPS", seconds: node.rest?.seconds ?? null, active: node.rest?.active ?? false, countsInTotal: node.rest?.countsInTotal ?? true } }))} className={FIELD_CLASS} aria-label={`Posição do descanso ${itemLabel}`}>
                  <option value="BETWEEN_REPS">Entre repetições</option><option value="BETWEEN_SETS">Entre séries</option><option value="AFTER_ALL">Após cada uma (inclui a última)</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={node.rest?.active ?? false} onChange={(event) => set(() => ({ ...node, rest: node.rest ? { ...node.rest, active: event.target.checked } : null }))} />ativo</label>
              <label className="grid gap-1">Saída a cada (s)<input type="number" min={0} value={node.sendOffSeconds ?? ""} onChange={(event) => set(() => ({ ...node, sendOffSeconds: event.target.value ? Number(event.target.value) : null }))} className={`${FIELD_CLASS} w-24`} aria-label={`Intervalo de saída ${itemLabel}`} /></label>
              <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => set(() => null)} aria-label={`Remover série ${itemLabel}`}>Remover série</button>
            </div>
            <NodesEditor nodes={node.children} unit={unit} depth={depth + 1} label={itemLabel} onChange={(children) => set(() => ({ ...node, children: children.length ? children : [newStep()] }))} />
          </div>
        );
      })}
      <div className="flex gap-2">
        <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => onChange([...nodes, newStep()])} aria-label={`Adicionar passo ${label}`}>+ Passo</button>
        {depth < 3 && <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => onChange([...nodes, newSet()])} aria-label={`Adicionar série ${label}`}>+ Série</button>}
      </div>
    </div>
  );
}

export function SessionV2Editor({ initial, title, onChange }: { initial: SessionContentV2 | null; title: string; onChange?: (content: SessionContentV2) => void }) {
  const [content, setContent] = useState<SessionContentV2>(initial ?? { schemaVersion: 2, pool: null, nutrition: null, blocks: [{ type: "WARMUP", name: "Aquecimento", children: [newStep()], notes: null }] });
  const parsed = useMemo(() => sessionContentV2Schema.safeParse(content), [content]);
  const totals = parsed.success ? sessionTotals(parsed.data) : null;
  const divergence = totals && title ? titleDivergence(title, totals) : null;
  const unit = content.pool?.unit ?? "m";
  useEffect(() => { if (parsed.success) onChange?.(parsed.data); }, [parsed, onChange]);

  return (
    <div className="space-y-3 text-sm" data-testid="session-v2-editor">
      <input type="hidden" name="sessionV2" value={JSON.stringify(content)} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">Piscina
          <select value={content.pool ? `${content.pool.length}${content.pool.unit}` : ""} onChange={(event) => {
            const value = event.target.value;
            setContent((current) => ({ ...current, pool: value ? { length: Number(value.replace(/[a-z]+$/, "")), unit: value.endsWith("yd") ? "yd" : "m" } : null }));
          }} className={FIELD_CLASS} aria-label="Piscina">
            <option value="">Não é piscina</option><option value="25m">25 m</option><option value="50m">50 m</option><option value="25yd">25 jardas</option>
          </select>
        </label>
        <p className="text-xs text-foreground/55">Jardas e metros não são convertidos entre si.</p>
      </div>
      {content.blocks.map((block, index) => (
        <div key={index} className="space-y-2 rounded-[16px] border border-white/10 p-3" data-testid="v2-block">
          <div className="flex flex-wrap gap-2">
            <select value={block.type} onChange={(event) => setContent((current) => ({ ...current, blocks: current.blocks.map((item, i) => (i === index ? { ...item, type: event.target.value as typeof item.type } : item)) }))} className={FIELD_CLASS} aria-label={`Tipo do bloco ${index + 1}`}>
              {V2_BLOCK_TYPES.map((type) => <option key={type} value={type}>{V2_BLOCK_TYPE_LABELS[type]}</option>)}
            </select>
            <input value={block.name} maxLength={120} onChange={(event) => setContent((current) => ({ ...current, blocks: current.blocks.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)) }))} className={`${FIELD_CLASS} flex-1`} aria-label={`Nome do bloco ${index + 1}`} />
            <button type="button" className={SECONDARY_ACTION_CLASS} disabled={content.blocks.length === 1} onClick={() => setContent((current) => ({ ...current, blocks: current.blocks.filter((_, i) => i !== index) }))}>Remover bloco</button>
          </div>
          <NodesEditor nodes={block.children} unit={unit} depth={1} label={`bloco ${index + 1}`} onChange={(children) => setContent((current) => ({ ...current, blocks: current.blocks.map((item, i) => (i === index ? { ...item, children: children.length ? children : [newStep()] } : item)) }))} />
        </div>
      ))}
      <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => setContent((current) => ({ ...current, blocks: [...current.blocks, { type: "MAIN", name: "Principal", children: [newStep()], notes: null }] }))}>+ Bloco</button>
      <label className="grid gap-1">Nutrição/hidratação (texto do professor, sem doses automáticas)
        <textarea rows={2} maxLength={2000} value={content.nutrition ?? ""} onChange={(event) => setContent((current) => ({ ...current, nutrition: event.target.value || null }))} className={FIELD_CLASS} aria-label="Nutrição" />
      </label>
      <div className="rounded-[14px] border border-white/10 p-3" data-testid="v2-totals">
        {!totals ? <p className="text-xs text-rose-400">Estrutura incompleta.</p> : (
          <>
            <p data-testid="v2-total-distance">Distância: {totals.distance > 0 ? `${totals.distance.toLocaleString("pt-BR")} ${totals.distanceUnit}` : "—"}{totals.distancePartial ? " (parte da sessão é por tempo)" : ""}</p>
            <p>Esforço: {formatSeconds(totals.effortSeconds)} · Recuperação prevista: {formatSeconds(totals.recoverySeconds)}</p>
            <p data-testid="v2-total-duration" data-exact={totals.durationExact}>Duração total {totals.durationExact ? "exata" : "estimada"}: {formatSeconds(totals.totalSeconds)}{totals.durationExact ? "" : " ou mais"}</p>
            {totals.durationNotes.length > 0 && <p className="text-xs text-foreground/55">Não exata por: {totals.durationNotes.join("; ")}.</p>}
          </>
        )}
        {divergence && <p className="mt-1 text-xs text-amber-300" data-testid="v2-title-divergence">{divergence}</p>}
      </div>
    </div>
  );
}
