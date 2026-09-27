"use client";

import { useActionState, useState } from "react";

import {
  declineWorkoutRequestAction,
  fulfillWorkoutRequestAction,
  type FulfillWorkoutRequestState,
} from "./actions";

const inputCls =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25";
const initialState: FulfillWorkoutRequestState = {};

export function FulfillRequestForm({
  requestId,
  schoolId,
  defaultSportType,
  defaultDate,
}: {
  requestId: string;
  schoolId: string;
  defaultSportType: string;
  defaultDate: Date | null;
}) {
  const [state, action, isPending] = useActionState(fulfillWorkoutRequestAction, initialState);
  const defaultDateStr = defaultDate ? new Date(defaultDate).toISOString().slice(0, 16) : "";

  return (
    <form action={action} className="space-y-2 border-t border-white/8 pt-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="schoolId" value={schoolId} />
      {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}

      <div className="space-y-1">
        <label htmlFor={`title-${requestId}`} className="text-xs font-medium text-foreground/70">
          Título do treino
        </label>
        <input
          id={`title-${requestId}`}
          name="title"
          defaultValue={`Treino de ${defaultSportType}`}
          required
          className={inputCls}
        />
        {state.fieldErrors?.title && <p className="text-xs text-destructive">{state.fieldErrors.title}</p>}
      </div>

      <div className="space-y-1">
        <label htmlFor={`when-${requestId}`} className="text-xs font-medium text-foreground/70">
          Data e hora
        </label>
        <input
          id={`when-${requestId}`}
          name="scheduledAt"
          type="datetime-local"
          defaultValue={defaultDateStr}
          required
          className={inputCls}
        />
        {state.fieldErrors?.scheduledAt && (
          <p className="text-xs text-destructive">{state.fieldErrors.scheduledAt}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          name="durationMinutes"
          type="number"
          min={1}
          placeholder="Duração (min)"
          aria-label="Duração em minutos"
          className={inputCls}
        />
        <input
          name="distanceKm"
          type="number"
          min={0}
          step={0.01}
          placeholder="Distância (km)"
          aria-label="Distância em quilômetros"
          className={inputCls}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="glass-button rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        {isPending ? "Aprovando…" : "Aprovar e criar treino"}
      </button>
    </form>
  );
}

/**
 * Declining closes the request for good — the athlete has to open a new one —
 * so it asks for confirmation and offers a reason, which is the only
 * explanation the athlete will receive.
 */
export function DeclineRequestForm({
  requestId,
  schoolId,
}: {
  requestId: string;
  schoolId: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-rose-300 underline-offset-4 hover:underline"
      >
        Recusar solicitação
      </button>
    );
  }

  return (
    <form action={declineWorkoutRequestAction} className="space-y-2 border-t border-white/8 pt-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="schoolId" value={schoolId} />
      <label htmlFor={`reason-${requestId}`} className="text-xs font-medium text-foreground/70">
        Motivo (o atleta verá)
      </label>
      <input
        id={`reason-${requestId}`}
        name="declineReason"
        type="text"
        placeholder="Ex.: agenda cheia nesta semana"
        className={inputCls}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-full bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/30"
        >
          Confirmar recusa
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-foreground/60 transition-colors hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
