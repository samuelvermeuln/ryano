"use client";

/**
 * SAM-69 — §11.4: the session as the athlete reads it — printable for the
 * pool deck (large type, no navigation) and, on a phone, one block at a time
 * with the current block highlighted.
 */
import { useState } from "react";

import { SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { sessionTotals, V2_BLOCK_TYPE_LABELS, type SessionContentV2, type SessionSet, type SessionStep } from "@/modules/school/domain/session-content-v2";

const minutes = (seconds: number) => (seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);

function describeStep(step: SessionStep, unit: string) {
  const amount = step.duration.type === "TIME" ? minutes(step.duration.seconds) : step.duration.type === "DISTANCE" ? `${step.duration.value} ${unit}` : "até o fim indicado";
  const intensity = step.intensity.primary?.kind === "TEXT" ? ` · ${step.intensity.primary.text}` : "";
  return `${step.name ? `${step.name}: ` : ""}${amount}${intensity}`;
}

function describeSet(set: SessionSet, unit: string): string {
  const inner = set.children.map((child) => (child.kind === "STEP" ? describeStep(child, unit) : `(${describeSet(child, unit)})`)).join(" + ");
  const rest = set.sendOffSeconds
    ? ` · saída a cada ${minutes(set.sendOffSeconds)}`
    : set.rest ? ` · descanso ${set.rest.seconds ? minutes(set.rest.seconds) : "completo"} ${set.rest.position === "AFTER_ALL" ? "após cada uma" : set.rest.position === "BETWEEN_SETS" ? "entre séries" : "entre repetições"}${set.rest.active ? " (ativo)" : ""}` : "";
  return `${set.repetitions} × ${inner}${rest}`;
}

export function SessionV2View({ content, title }: { content: SessionContentV2; title: string }) {
  const [current, setCurrent] = useState(0);
  const unit = content.pool?.unit ?? "m";
  const totals = sessionTotals(content);
  return (
    <section className="space-y-3 print:text-black" data-testid="session-v2-view">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Roteiro da sessão</h2>
        <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => window.print()}>Imprimir para a borda</button>
      </div>
      <h2 className="hidden text-2xl font-bold print:block" data-testid="session-print-title">{title}</h2>
      <p className="text-xs text-foreground/60 print:text-base">
        {content.pool ? `Piscina de ${content.pool.length} ${unit} · ` : ""}
        {totals.distance > 0 ? `${totals.distance.toLocaleString("pt-BR")} ${totals.distanceUnit} · ` : ""}
        {totals.durationExact ? `${minutes(totals.totalSeconds)}` : `cerca de ${minutes(totals.totalSeconds)} ou mais`}
      </p>
      <ol className="space-y-2">
        {content.blocks.map((block, index) => (
          <li
            key={index}
            data-testid="session-v2-block"
            data-current={index === current}
            className={`rounded-[14px] border p-3 print:block print:border-black print:text-lg ${index === current ? "border-primary/50 bg-primary/10" : "hidden border-white/10 sm:block"}`}
          >
            <p className="font-medium">{block.name} <span className="text-xs text-foreground/55 print:text-sm">({V2_BLOCK_TYPE_LABELS[block.type]})</span></p>
            <ul className="mt-1 space-y-0.5">
              {block.children.map((child, childIndex) => (
                <li key={childIndex}>{child.kind === "STEP" ? describeStep(child, unit) : describeSet(child, unit)}</li>
              ))}
            </ul>
            {block.notes && <p className="mt-1 text-xs text-foreground/60">{block.notes}</p>}
          </li>
        ))}
      </ol>
      {content.nutrition && <p className="text-xs text-foreground/70">Nutrição/hidratação: {content.nutrition}</p>}
      <div className="flex items-center justify-between gap-2 sm:hidden print:hidden" data-testid="session-v2-stepper">
        <button type="button" className={SECONDARY_ACTION_CLASS} disabled={current === 0} onClick={() => setCurrent((value) => value - 1)}>Bloco anterior</button>
        <span className="text-xs text-foreground/60" data-testid="session-v2-current">Bloco atual {current + 1} de {content.blocks.length}</span>
        <button type="button" className={SECONDARY_ACTION_CLASS} disabled={current === content.blocks.length - 1} onClick={() => setCurrent((value) => value + 1)}>Próximo bloco</button>
      </div>
    </section>
  );
}
