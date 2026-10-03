"use client";

/**
 * SAM-67 — "Atribuir do catálogo" from the athlete's calendar, without
 * leaving it (§19.2): pick a template, see the preview for this athlete
 * (references resolved per athlete, conflicts on the day, blocking reasons)
 * and publish. It goes through the same batch flow (SAM-60) with one
 * recipient: the coach authors; nothing is generated.
 */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Modal } from "@/components/modal";
import { FIELD_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";

type Template = { id: string; title: string; sportType: string; status: string; version: number };
type Scope = { kind: "independent" } | { kind: "school"; schoolId: string };
type PreviewRow = { athleteId: string; status: "READY" | "BLOCKED"; reason: string | null; conflicts: Array<{ title: string | null }> };

async function json<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (T & { message?: string; details?: Array<{ message: string }> }) | null;
  if (!response.ok) throw new Error(payload?.details?.[0]?.message ?? payload?.message ?? "Não foi possível concluir.");
  return payload as T;
}

export function AssignFromCatalogDialog({ athleteId, athleteName, date, scope }: { athleteId: string; athleteName: string; date: string; scope: Scope }) {
  const router = useRouter();
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [chosen, setChosen] = useState<Template | null>(null);
  const [prescription, setPrescription] = useState<Record<string, unknown> | null>(null);
  const [day, setDay] = useState(date);
  const [time, setTime] = useState("07:00");
  const [preview, setPreview] = useState<PreviewRow | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<void>) => {
    setMessage(null);
    startTransition(async () => {
      try { await action(); } catch (failure) { setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "Não foi possível concluir." }); }
    });
  };

  function openDialog() {
    setOpen(true);
    setChosen(null);
    setPreview(null);
    run(async () => {
      const list = await json<Template[]>(await fetch("/api/workout-catalog"));
      setTemplates(list.filter((template) => template.status === "ACTIVE"));
    });
  }

  function choose(template: Template) {
    setChosen(template);
    setPreview(null);
    run(async () => {
      const detail = await json<{ template: { title: string; sportType: string; description: string | null }; version: { number: number; content: { blocks: unknown[]; instructions: string | null; openWater?: unknown } } }>(await fetch(`/api/workout-catalog/${template.id}`));
      setPrescription({
        title: detail.template.title, sportType: detail.template.sportType,
        description: detail.version.content.instructions ?? detail.template.description ?? null,
        blocks: detail.version.content.blocks, templateId: template.id, templateVersion: detail.version.number,
        openWater: detail.version.content.openWater ?? null,
      });
    });
  }

  const prescriptionAt = () => ({ ...prescription, scheduledAtLocal: `${day}T${time}` });

  function showPreview() {
    run(async () => {
      const rows = await json<PreviewRow[]>(await fetch("/api/assignment-batches/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope, prescription: prescriptionAt(), athleteIds: [athleteId] }) }));
      setPreview(rows.find((row) => row.athleteId === athleteId) ?? null);
    });
  }

  function publish() {
    run(async () => {
      const result = await json<{ recipients: Array<{ status: string; reason: string | null }> }>(await fetch("/api/assignment-batches", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, prescription: prescriptionAt(), recipients: [{ athleteId }], idempotencyKey: `calendar-${athleteId}-${chosen?.id}-${day}T${time}` }),
      }));
      const row = result.recipients[0];
      if (row?.status !== "OK") throw new Error(row?.reason ?? "Não foi possível publicar.");
      setMessage({ tone: "ok", text: "Treino atribuído." });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button ref={opener} type="button" className={SECONDARY_ACTION_CLASS} onClick={openDialog} data-testid="assign-from-catalog">Atribuir do catálogo</button>
      {message?.tone === "ok" && <span role="status" className="ml-2 text-xs text-foreground/70">{message.text}</span>}
      {open && (
        <Modal title={`Atribuir do catálogo — ${athleteName}`} onClose={() => setOpen(false)} returnFocusTo={opener} size="lg">
          <div className="space-y-3 text-sm" data-testid="assign-from-catalog-dialog">
            {!chosen ? (
              templates === null ? <p className="text-foreground/60">Carregando o catálogo…</p> : templates.length === 0 ? <p className="text-foreground/60">Nenhum modelo ativo no seu catálogo.</p> : (
                <ul className="max-h-80 space-y-2 overflow-y-auto">
                  {templates.map((template) => (
                    <li key={template.id}>
                      <button type="button" className="w-full rounded-[14px] border border-white/10 px-3 py-2 text-left hover:bg-white/10" onClick={() => choose(template)} data-testid="catalog-option">
                        {template.title} <span className="text-xs text-foreground/55">· v{template.version}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <>
                <p>Modelo: <strong>{chosen.title}</strong> (versão {chosen.version})</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1">Data<input type="date" value={day} onChange={(event) => { setDay(event.target.value); setPreview(null); }} className={FIELD_CLASS} aria-label="Data da sessão" /></label>
                  <label className="grid gap-1">Horário<input type="time" value={time} onChange={(event) => { setTime(event.target.value); setPreview(null); }} className={FIELD_CLASS} aria-label="Horário da sessão" /></label>
                </div>
                {preview && (
                  <div className="rounded-[14px] border border-white/10 p-3 text-xs" data-testid="assign-preview">
                    {preview.status === "BLOCKED" ? <p className="text-rose-400">Bloqueado: {preview.reason}</p> : <p>Pronto para publicar para {athleteName}.</p>}
                    {preview.conflicts.length > 0 && <p className="text-amber-300">Já há sessão no dia: {preview.conflicts.map((item) => item.title ?? "treino").join(", ")}.</p>}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={SECONDARY_ACTION_CLASS} onClick={() => { setChosen(null); setPreview(null); }}>Trocar modelo</button>
                  <button type="button" disabled={pending || !prescription} className={SECONDARY_ACTION_CLASS} onClick={showPreview}>Ver prévia</button>
                  <button type="button" disabled={pending || !preview || preview.status === "BLOCKED"} className={PRIMARY_ACTION_CLASS} onClick={publish}>Publicar</button>
                </div>
              </>
            )}
            {message?.tone === "error" && <p role="alert" className="text-xs text-rose-400">{message.text}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
