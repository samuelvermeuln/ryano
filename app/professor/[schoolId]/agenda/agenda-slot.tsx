"use client";

/**
 * SAM-16 — one chip per (day, time) slot. N athletes at the same time are one
 * chip with a count; expanding it opens a centered modal (architecture/rules/ui.md)
 * listing each athlete with status, link to the workout detail and — for the
 * responsible coach — an inline reschedule form.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { StatusBadge } from "@/components/status-badge";
import { rescheduleFromAgendaAction, type AgendaActionState } from "./actions";

export type AgendaEntryView = {
  assignmentId: string;
  athleteId: string;
  athleteName: string;
  title: string;
  sportLabel: string | null;
  team: string | null;
  coach: string | null;
  statusLabel: string;
  statusTone: "neutral" | "success" | "warning" | "danger";
  /** `YYYY-MM-DDTHH:mm` in the school's zone — the reschedule form's default. */
  localDateTime: string;
  href: string;
  canReschedule: boolean;
};

export type AgendaSlotView = {
  key: string;
  time: string;
  /** "ter., 6 de out." */
  dayLabel: string;
  who: string;
  detail: string | null;
  entries: AgendaEntryView[];
};

const inputCls =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25";

export function AgendaSlotChip({
  schoolId,
  slot,
  timeZone,
}: {
  schoolId: string;
  slot: AgendaSlotView;
  timeZone: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const grouped = slot.entries.length > 1;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        data-testid="agenda-slot"
        data-slot-key={slot.key}
        data-count={slot.entries.length}
        aria-label={`${slot.time}, ${slot.who}${slot.detail ? `, ${slot.detail}` : ""}`}
        className={`block w-full rounded-xl border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/10 ${
          grouped ? "theme-pill-info border-white/15" : "border-white/10 bg-white/5"
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span className="font-semibold tabular-nums">{slot.time}</span>
          <span className="truncate">{slot.who}</span>
        </span>
        {slot.detail && <span className="block truncate text-[11px] text-foreground/60">{slot.detail}</span>}
      </button>

      {open && (
        <Modal
          title={`${slot.dayLabel} · ${slot.time}`}
          onClose={() => setOpen(false)}
          size="lg"
          returnFocusTo={triggerRef}
        >
          <p className="text-xs text-foreground/55">
            {slot.entries.length === 1 ? "1 prescrição" : `${slot.entries.length} prescrições`} neste horário
            {slot.detail ? ` · ${slot.detail}` : ""} · horário da escola ({timeZone.replace(/_/g, " ")}).
          </p>
          <ul className="mt-4 space-y-3" data-testid="agenda-slot-entries">
            {slot.entries.map((entry) => (
              <AgendaEntryRow
                key={entry.assignmentId}
                schoolId={schoolId}
                entry={entry}
                onRescheduled={() => setOpen(false)}
              />
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}

const initialState: AgendaActionState = {};

function AgendaEntryRow({
  schoolId,
  entry,
  onRescheduled,
}: {
  schoolId: string;
  entry: AgendaEntryView;
  onRescheduled: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<AgendaActionState>(initialState);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  /**
   * Success is handled in the submit path, not in an effect: the action's
   * `revalidatePath` ships the new agenda tree with its response, so this row
   * (now in another slot) may be unmounted in the same commit that would set
   * `success` — an effect here would never run and the modal would stay open.
   * The parent's `onRescheduled` survives that unmount.
   */
  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await rescheduleFromAgendaAction(state, formData);
      if (result.success) {
        onRescheduled();
        router.refresh();
        return;
      }
      setState(result);
    });
  }

  return (
    <li
      className="rounded-[16px] border border-white/10 bg-white/5 p-3"
      data-testid="agenda-entry"
      data-assignment-id={entry.assignmentId}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{entry.athleteName}</p>
          <p className="text-xs text-foreground/60">
            {[entry.title, entry.sportLabel, entry.team, entry.coach ? `Prof. ${entry.coach}` : null]
              .filter(Boolean).join(" · ")}
          </p>
        </div>
        <StatusBadge tone={entry.statusTone}>{entry.statusLabel}</StatusBadge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link
          href={entry.href}
          aria-label={`Abrir treino de ${entry.athleteName}`}
          className="glass-button rounded-full px-3 py-1.5 text-xs font-medium"
        >
          Abrir detalhe
        </Link>
        {entry.canReschedule && (
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            aria-expanded={editing}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium transition hover:bg-white/10"
          >
            {editing ? "Cancelar" : "Remarcar"}
          </button>
        )}
      </div>
      {editing && (
        <form action={submit} className="mt-3 space-y-2 border-t border-white/8 pt-3">
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="assignmentId" value={entry.assignmentId} />
          {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground/70">Nova data e hora</span>
            <input
              name="scheduledAt"
              type="datetime-local"
              defaultValue={entry.localDateTime}
              required
              className={inputCls}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground/70">Motivo (opcional)</span>
            <input name="reason" maxLength={2000} placeholder="Ex.: chuva, feriado…" className={inputCls} />
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="glass-button-primary rounded-full px-4 py-2 text-xs font-medium disabled:opacity-60"
          >
            {isPending ? "Remarcando…" : "Confirmar remarcação"}
          </button>
        </form>
      )}
    </li>
  );
}
