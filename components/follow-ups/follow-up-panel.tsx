"use client";

/**
 * SAM-55 — "Pendências" of the coach and of the school (§7.2, §19.2):
 * counters with their definition and period, list by overdue/priority/
 * deadline, and the actions ver, assumir, resolver, reagendar (data + motivo)
 * and cancelar (motivo). Opening a task marks it seen — never resolved.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/empty-state";
import { FIELD_CLASS, ITEM_CLASS } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import {
  FOLLOW_UP_COUNTER_DEFINITIONS,
  FOLLOW_UP_PRIORITY_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  type FollowUpStatus,
} from "@/modules/school/domain/follow-up-task";

export type FollowUpItem = {
  id: string;
  title: string;
  href: string | null;
  athleteName: string | null;
  queue: boolean;
  status: string;
  priority: string;
  dueAt: string | null;
  rescheduledTo: string | null;
  overdue: boolean;
  createdAt: string;
  version: number;
  transitions: Array<{ toStatus: string; actorName: string | null; reason: string | null; at: string }>;
};

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: null, label: "Tudo" },
] as const;

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : null;
}

function TaskRow({ task }: { task: FollowUpItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "reschedule" | "cancel" | "history">("idle");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const open = ["NEW", "SEEN", "IN_PROGRESS", "RESCHEDULED"].includes(task.status);

  function act(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/follow-ups/${task.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: task.version, ...body }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message ?? "Não foi possível concluir.");
        return;
      }
      setMode("idle");
      setReason("");
      router.refresh();
    });
  }

  const deadline = formatDate(task.rescheduledTo ?? task.dueAt);
  return (
    <li className={`${ITEM_CLASS} space-y-2`} data-testid="follow-up-task" data-task-id={task.id} data-status={task.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-tight">{task.title}</p>
          <p className="text-xs text-foreground/55">
            <span data-testid="follow-up-status">{FOLLOW_UP_STATUS_LABELS[task.status as FollowUpStatus] ?? task.status}</span>
            {" · prioridade "}{FOLLOW_UP_PRIORITY_LABELS[task.priority as keyof typeof FOLLOW_UP_PRIORITY_LABELS] ?? task.priority}
            {task.queue ? " · fila da escola" : ""}
            {deadline ? ` · prazo ${deadline}` : ""}
            {task.overdue ? " · vencida" : ""}
          </p>
          <p className="text-[11px] text-foreground/45">Criada em {formatDate(task.createdAt)}</p>
        </div>
        {task.href && (
          <Link href={task.href} className="shrink-0 text-xs font-semibold text-foreground/70 hover:text-foreground">
            Abrir origem
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {task.status === "NEW" && (
          <button type="button" disabled={pending} onClick={() => act({ action: "see" })} className="glass-button rounded-full px-3 py-1.5 font-semibold">
            Marcar como visto
          </button>
        )}
        {open && task.status !== "IN_PROGRESS" && (
          <button type="button" disabled={pending} onClick={() => act({ action: "start" })} className="glass-button rounded-full px-3 py-1.5 font-semibold">
            Assumir
          </button>
        )}
        {open && (
          <>
            <button type="button" disabled={pending} onClick={() => act({ action: "resolve" })} className="glass-button rounded-full px-3 py-1.5 font-semibold">
              Resolver
            </button>
            <button type="button" disabled={pending} onClick={() => setMode(mode === "reschedule" ? "idle" : "reschedule")} className="rounded-full px-3 py-1.5 text-foreground/70 hover:text-foreground">
              Reagendar
            </button>
            <button type="button" disabled={pending} onClick={() => setMode(mode === "cancel" ? "idle" : "cancel")} className="rounded-full px-3 py-1.5 text-foreground/70 hover:text-foreground">
              Cancelar
            </button>
          </>
        )}
        <button type="button" onClick={() => setMode(mode === "history" ? "idle" : "history")} className="rounded-full px-3 py-1.5 text-foreground/55 hover:text-foreground">
          Histórico ({task.transitions.length})
        </button>
      </div>

      {(mode === "reschedule" || mode === "cancel") && (
        <form
          className="grid gap-2 sm:grid-cols-[auto_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === "reschedule") act({ action: "reschedule", rescheduledTo: new Date(`${date}T12:00:00`).toISOString(), reason });
            else act({ action: "cancel", reason });
          }}
        >
          {mode === "reschedule" && (
            <label className="text-xs">
              <span className="sr-only">Nova data</span>
              <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className={FIELD_CLASS} aria-label="Nova data" />
            </label>
          )}
          <label className="text-xs">
            <span className="sr-only">Motivo</span>
            <input required minLength={1} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo (obrigatório)" className={FIELD_CLASS} aria-label="Motivo" />
          </label>
          <button type="submit" disabled={pending} className="glass-button rounded-full px-3 py-1.5 text-xs font-semibold">
            {mode === "reschedule" ? "Confirmar nova data" : "Confirmar cancelamento"}
          </button>
        </form>
      )}

      {mode === "history" && (
        <ol className="space-y-1 text-[11px] text-foreground/60" data-testid="follow-up-history">
          {task.transitions.map((transition, index) => (
            <li key={index}>
              {new Date(transition.at).toLocaleString("pt-BR")} — {FOLLOW_UP_STATUS_LABELS[transition.toStatus as FollowUpStatus] ?? transition.toStatus}
              {transition.actorName ? ` por ${transition.actorName}` : " (sistema)"}
              {transition.reason ? `: ${transition.reason}` : ""}
            </li>
          ))}
        </ol>
      )}

      {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
    </li>
  );
}

export function FollowUpPanel({
  basePath,
  counters,
  periodDays,
  tasks,
  showClosed,
}: {
  basePath: string;
  counters: { open: number; overdue: number; resolved: number };
  periodDays: number | null;
  tasks: FollowUpItem[];
  showClosed: boolean;
}) {
  const query = (days: number | null, closed: boolean) => {
    const params = new URLSearchParams();
    if (days) params.set("dias", String(days));
    if (closed) params.set("status", "all");
    const text = params.toString();
    return text ? `${basePath}?${text}` : basePath;
  };
  const periodLabel = periodDays ? `últimos ${periodDays} dias` : "todo o período";
  return (
    <>
      <nav className="flex flex-wrap gap-2 text-xs" aria-label="Período">
        {PERIODS.map((period) => (
          <Link
            key={period.label}
            href={query(period.days, showClosed)}
            aria-current={period.days === periodDays ? "true" : undefined}
            className={`rounded-full border px-3 py-1.5 ${period.days === periodDays ? "border-white/30 font-semibold" : "border-white/10 text-foreground/60"}`}
          >
            {period.label}
          </Link>
        ))}
        <Link href={query(periodDays, !showClosed)} className="rounded-full border border-white/10 px-3 py-1.5 text-foreground/60">
          {showClosed ? "Só abertas" : "Incluir resolvidas e canceladas"}
        </Link>
      </nav>

      <StatTiles
        items={[
          { label: "Abertas", value: counters.open, tone: counters.open > 0 ? "warning" : "neutral", hint: `${FOLLOW_UP_COUNTER_DEFINITIONS.open} (${periodLabel})` },
          { label: "Vencidas", value: counters.overdue, tone: counters.overdue > 0 ? "danger" : "neutral", hint: FOLLOW_UP_COUNTER_DEFINITIONS.overdue },
          { label: "Resolvidas", value: counters.resolved, hint: `${FOLLOW_UP_COUNTER_DEFINITIONS.resolved} (${periodLabel})` },
        ]}
      />

      <SectionCard title="Pendências" description="Ler o aviso não resolve a pendência: resolva, reagende (com data e motivo) ou cancele com motivo.">
        {tasks.length === 0 ? (
          <EmptyState title="Nenhuma pendência" description="Quando um atleta registrar ou alterar um evento, a pendência aparece aqui." />
        ) : (
          <ul className="space-y-3" data-testid="follow-up-list">
            {tasks.map((task) => <TaskRow key={task.id} task={task} />)}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
