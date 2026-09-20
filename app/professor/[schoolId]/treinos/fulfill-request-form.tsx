"use client";

import { useActionState } from "react";

import { fulfillWorkoutRequestAction, type FulfillWorkoutRequestState } from "./actions";

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
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
    <form action={action} className="space-y-2 border-t border-border pt-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="schoolId" value={schoolId} />
      {state.message && <p className="text-xs text-destructive">{state.message}</p>}

      <input name="title" defaultValue={`Treino de ${defaultSportType}`} required className={inputCls} />
      {state.fieldErrors?.title && <p className="text-xs text-destructive">{state.fieldErrors.title}</p>}

      <input name="scheduledAt" type="datetime-local" defaultValue={defaultDateStr} required className={inputCls} />
      {state.fieldErrors?.scheduledAt && <p className="text-xs text-destructive">{state.fieldErrors.scheduledAt}</p>}

      <div className="grid grid-cols-2 gap-2">
        <input name="durationMinutes" type="number" min={1} placeholder="Duração (min)" className={inputCls} />
        <input name="distanceKm" type="number" min={0} step={0.01} placeholder="Distância (km)" className={inputCls} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-medium hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Aprovando…" : "Aprovar e criar treino"}
      </button>
    </form>
  );
}
