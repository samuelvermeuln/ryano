"use client";

/**
 * SAM-71 — the coach's edits of a preparation plan: phases (a change asks
 * for its reason), milestones with what will be observed, the decision on a
 * milestone with the coach's review, tagging sessions with the event, and
 * moving a block of linked sessions after a postponement (preview first).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";

import { FIELD_CLASS, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import {
  ILLUSTRATIVE_SCHEDULE_TEXT, MILESTONE_DECISIONS, MILESTONE_EVIDENCE_LABELS, MILESTONE_EVIDENCE_TYPES, MILESTONE_STATUS_LABELS,
  PHASE_TYPE_LABELS, PHASE_TYPES, type PhaseType,
} from "@/modules/school/domain/preparation-plan";

async function send(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: method === "DELETE" ? undefined : JSON.stringify(body) });
  const payload = (await response.json().catch(() => null)) as { message?: string; details?: Array<{ message: string }> } | null;
  if (!response.ok) throw new Error(payload?.details?.[0]?.message ?? payload?.message ?? "Não foi possível concluir.");
  return payload;
}

function useSubmit(onDone?: () => void) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<string>) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const text = await work();
        setMessage({ tone: "ok", text });
        onDone?.();
        router.refresh();
      } catch (failure) {
        setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "Não foi possível concluir." });
      }
    });
  };
  const feedback: ReactNode = message ? (
    <p role={message.tone === "error" ? "alert" : "status"} className={`text-xs ${message.tone === "error" ? "text-rose-400" : "text-emerald-500"}`}>{message.text}</p>
  ) : null;
  return { run, pending, feedback };
}

const formValues = (event: FormEvent<HTMLFormElement>) => Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;

export type PhaseFormValues = {
  id: string; type: string; customName: string | null; startLocalDate: string; endLocalDate: string;
  purpose: string | null; protocolNotes: string | null; version: number;
};

export function PhaseForm({ preparationId, phase }: { preparationId: string; phase?: PhaseFormValues }) {
  const { run, pending, feedback } = useSubmit();
  const [type, setType] = useState<PhaseType>((phase?.type as PhaseType) ?? "DEVELOPMENT");
  return (
    <form
      className="grid gap-2 text-sm sm:grid-cols-2"
      data-testid={phase ? "phase-edit-form" : "phase-form"}
      onSubmit={(event) => {
        event.preventDefault();
        const values = formValues(event);
        run(async () => {
          await send(`/api/preparations/${preparationId}/phases`, {
            phaseId: phase?.id ?? null,
            expectedVersion: phase?.version ?? null,
            reason: values.reason || null,
            phase: {
              type: values.type, customName: values.customName || null, startLocalDate: values.startLocalDate, endLocalDate: values.endLocalDate,
              purpose: values.purpose || null, protocolNotes: values.protocolNotes || null,
            },
          });
          return phase ? "Fase alterada (versão anterior guardada)." : "Fase criada.";
        });
      }}
    >
      <label className="grid gap-1">Tipo
        <select name="type" value={type} onChange={(event) => setType(event.target.value as PhaseType)} className={FIELD_CLASS}>
          {PHASE_TYPES.map((value) => <option key={value} value={value}>{PHASE_TYPE_LABELS[value]}</option>)}
        </select>
      </label>
      {type === "CUSTOM" && <label className="grid gap-1">Nome da fase<input name="customName" required maxLength={120} defaultValue={phase?.customName ?? ""} className={FIELD_CLASS} /></label>}
      <label className="grid gap-1">Início<input type="date" name="startLocalDate" required defaultValue={phase?.startLocalDate} className={FIELD_CLASS} /></label>
      <label className="grid gap-1">Fim<input type="date" name="endLocalDate" required defaultValue={phase?.endLocalDate} className={FIELD_CLASS} /></label>
      <label className="grid gap-1 sm:col-span-2">Finalidade<input name="purpose" maxLength={1000} defaultValue={phase?.purpose ?? ""} className={FIELD_CLASS} /></label>
      <label className="grid gap-1 sm:col-span-2">Protocolo/observação do professor (registrado, nunca aplicado automaticamente)
        <textarea name="protocolNotes" rows={2} maxLength={2000} defaultValue={phase?.protocolNotes ?? ""} className={FIELD_CLASS} />
      </label>
      {phase && <label className="grid gap-1 sm:col-span-2">Motivo da alteração<input name="reason" required maxLength={1000} className={FIELD_CLASS} /></label>}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS}>{phase ? "Salvar alteração" : "Adicionar fase"}</button>
        {feedback}
      </div>
    </form>
  );
}

export function MilestoneForm({ preparationId, phases }: { preparationId: string; phases: Array<{ id: string; label: string }> }) {
  const { run, pending, feedback } = useSubmit();
  return (
    <form
      className="grid gap-2 text-sm sm:grid-cols-2"
      data-testid="milestone-form"
      onSubmit={(event) => {
        event.preventDefault();
        const values = formValues(event);
        const form = event.currentTarget;
        run(async () => {
          await send(`/api/preparations/${preparationId}/milestones`, {
            milestone: { title: values.title, criterion: values.criterion, dueLocalDate: values.dueLocalDate, evidenceType: values.evidenceType, phaseId: values.phaseId || null },
          });
          form.reset();
          return "Marco criado.";
        });
      }}
    >
      <label className="grid gap-1">Título<input name="title" required maxLength={200} className={FIELD_CLASS} placeholder="Simulado até 12/11" /></label>
      <label className="grid gap-1">Prazo<input type="date" name="dueLocalDate" required className={FIELD_CLASS} /></label>
      <label className="grid gap-1 sm:col-span-2">O que será observado
        <textarea name="criterion" required rows={2} maxLength={2000} className={FIELD_CLASS} placeholder="Realizar a sessão de referência, registrar a percepção de esforço e revisar a estabilidade do ritmo" />
      </label>
      <label className="grid gap-1">Evidência aceita
        <select name="evidenceType" className={FIELD_CLASS}>
          {MILESTONE_EVIDENCE_TYPES.map((value) => <option key={value} value={value}>{MILESTONE_EVIDENCE_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Fase (opcional)
        <select name="phaseId" className={FIELD_CLASS}>
          <option value="">Sem fase</option>
          {phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.label}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS}>Adicionar marco</button>
        {feedback}
      </div>
    </form>
  );
}

export function MilestoneDecisionForm({ milestoneId }: { milestoneId: string }) {
  const { run, pending, feedback } = useSubmit();
  return (
    <form
      className="grid gap-2 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-end"
      data-testid="milestone-decision"
      onSubmit={(event) => {
        event.preventDefault();
        const values = formValues(event);
        run(async () => {
          await send(`/api/preparation-milestones/${milestoneId}`, { decision: values.decision, observation: values.observation, isVisible: true });
          return "Decisão registrada.";
        });
      }}
    >
      <label className="grid gap-1">Decisão
        <select name="decision" className={FIELD_CLASS}>
          {MILESTONE_DECISIONS.map((value) => <option key={value} value={value}>{MILESTONE_STATUS_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Parecer<input name="observation" required maxLength={5000} className={FIELD_CLASS} /></label>
      <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS}>Registrar decisão</button>
      <div className="sm:col-span-3">{feedback}</div>
    </form>
  );
}

export function MilestoneStatusButtons({ milestoneId, status }: { milestoneId: string; status: string }) {
  const { run, pending, feedback } = useSubmit();
  const options = (["IN_PROGRESS", "IN_REVIEW", "CANCELLED"] as const).filter((value) => value !== status);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((value) => (
        <button key={value} type="button" disabled={pending} className={SECONDARY_ACTION_CLASS}
          onClick={() => run(async () => { await send(`/api/preparation-milestones/${milestoneId}`, { status: value }); return `Marco: ${MILESTONE_STATUS_LABELS[value].toLowerCase()}.`; })}>
          {value === "CANCELLED" ? "Cancelar marco" : `Marcar "${MILESTONE_STATUS_LABELS[value].toLowerCase()}"`}
        </button>
      ))}
      {feedback}
    </div>
  );
}

export function LinkSessionForm({ preparationId, sessions, phases, milestones }: {
  preparationId: string;
  sessions: Array<{ assignmentId: string; label: string }>;
  phases: Array<{ id: string; label: string }>;
  milestones: Array<{ id: string; title: string }>;
}) {
  const { run, pending, feedback } = useSubmit();
  if (sessions.length === 0) return <p className="text-xs text-foreground/55">Nenhuma sessão sua deste aluno entre 3 semanas atrás e os próximos 4 meses.</p>;
  return (
    <form
      className="grid gap-2 text-sm sm:grid-cols-3 sm:items-end"
      data-testid="link-session"
      onSubmit={(event) => {
        event.preventDefault();
        const values = formValues(event);
        run(async () => {
          await send(`/api/preparations/${preparationId}/session-links`, { assignmentId: values.assignmentId, phaseId: values.phaseId || null, milestoneId: values.milestoneId || null });
          return "Sessão ligada ao evento.";
        });
      }}
    >
      <label className="grid gap-1">Sessão
        <select name="assignmentId" className={FIELD_CLASS}>
          {sessions.map((session) => <option key={session.assignmentId} value={session.assignmentId}>{session.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Fase
        <select name="phaseId" className={FIELD_CLASS}>
          <option value="">Sem fase</option>
          {phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Marco
        <select name="milestoneId" className={FIELD_CLASS}>
          <option value="">Sem marco</option>
          {milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <button type="submit" disabled={pending} className={SECONDARY_ACTION_CLASS}>Ligar sessão</button>
        {feedback}
      </div>
    </form>
  );
}

export function UnlinkSessionButton({ preparationId, linkId }: { preparationId: string; linkId: string }) {
  const { run, pending, feedback } = useSubmit();
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={pending} className="text-xs text-foreground/60 underline"
        onClick={() => run(async () => { await send(`/api/preparations/${preparationId}/session-links/${linkId}`, null, "DELETE"); return "Ligação removida."; })}>
        desligar
      </button>
      {feedback}
    </span>
  );
}

type MoveRow = { assignmentId: string; title: string; fromLocal: string | null; toLocal: string | null; status: "READY" | "BLOCKED"; reason: string | null; conflicts: string[] };

export function MoveSessionsForm({ preparationId, sessions }: { preparationId: string; sessions: Array<{ assignmentId: string; label: string }> }) {
  const [preview, setPreview] = useState<MoveRow[] | null>(null);
  const { run, pending, feedback } = useSubmit(() => setPreview(null));
  const [selected, setSelected] = useState<string[]>([]);
  const [shiftDays, setShiftDays] = useState("7");
  const [reason, setReason] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const body = { assignmentIds: selected, shiftDays: Number(shiftDays), reason: reason || null };
  const fmt = (value: string | null) => (value ? `${value.slice(8, 10)}/${value.slice(5, 7)} ${value.slice(11, 16)}` : "—");
  if (sessions.length === 0) return null;
  return (
    <div className="space-y-2 text-sm" data-testid="move-sessions">
      <fieldset className="space-y-1">
        <legend className="text-xs text-foreground/60">Sessões ligadas a mover</legend>
        {sessions.map((session) => (
          <label key={session.assignmentId} className="flex items-center gap-2">
            <input type="checkbox" checked={selected.includes(session.assignmentId)}
              onChange={(event) => { setPreview(null); setSelected((current) => event.target.checked ? [...current, session.assignmentId] : current.filter((id) => id !== session.assignmentId)); }} />
            {session.label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <label className="grid gap-1">Mover (dias)<input type="number" min={-120} max={120} value={shiftDays} onChange={(event) => { setPreview(null); setShiftDays(event.target.value); }} className={FIELD_CLASS} /></label>
        <label className="grid gap-1">Motivo<input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} className={FIELD_CLASS} placeholder="evento adiado" /></label>
        <button type="button" disabled={loading || selected.length === 0} className={SECONDARY_ACTION_CLASS}
          onClick={() => {
            setPreviewError(null);
            startLoading(async () => {
              try {
                setPreview(await send(`/api/preparations/${preparationId}/move-sessions`, { ...body, preview: true }) as unknown as MoveRow[]);
              } catch (failure) {
                setPreviewError(failure instanceof Error ? failure.message : "Não foi possível montar a prévia.");
              }
            });
          }}>
          Ver prévia
        </button>
      </div>
      {previewError && <p role="alert" className="text-xs text-rose-400">{previewError}</p>}
      {preview && (
        <div className="space-y-2" data-testid="move-preview">
          <ul className="space-y-1">
            {preview.map((row) => (
              <li key={row.assignmentId} data-testid="move-preview-row" data-status={row.status}>
                {row.title}: {fmt(row.fromLocal)} → {fmt(row.toLocal)}
                {row.status === "BLOCKED" ? ` · ${row.reason}` : ""}
                {row.conflicts.length > 0 ? ` · no mesmo dia: ${row.conflicts.join(", ")}` : ""}
              </li>
            ))}
          </ul>
          <button type="button" disabled={pending} className={PRIMARY_ACTION_CLASS}
            onClick={() => run(async () => {
              const result = await send(`/api/preparations/${preparationId}/move-sessions`, body) as unknown as { moved: string[] };
              setSelected([]);
              return `${result.moved.length} sessão(ões) movida(s); cada uma ganhou nova versão.`;
            })}>
            Mover e criar versões
          </button>
        </div>
      )}
      {feedback}
    </div>
  );
}

/** §8.2 — the illustrative schedule as text to copy; nothing is created from it. */
export function IllustrativeScheduleModel() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 text-sm">
      <textarea readOnly rows={10} defaultValue={ILLUSTRATIVE_SCHEDULE_TEXT} className={FIELD_CLASS} aria-label="Modelo ilustrativo" />
      <button type="button" className={SECONDARY_ACTION_CLASS}
        onClick={() => { void navigator.clipboard?.writeText(ILLUSTRATIVE_SCHEDULE_TEXT).then(() => setCopied(true)); }}>
        {copied ? "Copiado" : "Copiar modelo"}
      </button>
    </div>
  );
}
