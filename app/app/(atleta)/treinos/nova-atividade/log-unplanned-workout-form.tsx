"use client";

import { useActionState } from "react";

import { RYVANO_SPORT_TYPES, getRyvanoSportLabel } from "@/modules/shared/activities/sport-types";
import { logUnplannedWorkoutAction, type LogUnplannedWorkoutState } from "../actions";

const inputCls = "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const initialState: LogUnplannedWorkoutState = {};

export function LogUnplannedWorkoutForm() {
  const [state, action, isPending] = useActionState(logUnplannedWorkoutAction, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-5">
      {state.message && (
        <p className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">{state.message}</p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="sportType" className="block text-sm font-medium">
          Modalidade <span className="text-destructive">*</span>
        </label>
        <select id="sportType" name="sportType" required defaultValue="" className={inputCls}>
          <option value="" disabled>Selecione…</option>
          {RYVANO_SPORT_TYPES.filter((sport) => sport !== "default").map((sport) => (
            <option key={sport} value={sport}>{getRyvanoSportLabel(sport)}</option>
          ))}
        </select>
        {state.fieldErrors?.sportType && <p className="text-xs text-destructive">{state.fieldErrors.sportType}</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="date" className="block text-sm font-medium">
          Data <span className="text-destructive">*</span>
        </label>
        <input id="date" name="date" type="date" required max={today} defaultValue={today} className={inputCls} />
        {state.fieldErrors?.date && <p className="text-xs text-destructive">{state.fieldErrors.date}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="durationMinutes" className="block text-sm font-medium">Duração (min)</label>
          <input id="durationMinutes" name="durationMinutes" type="number" min={1} step={1} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="distanceKm" className="block text-sm font-medium">Distância (km)</label>
          <input id="distanceKm" name="distanceKm" type="number" min={0} step={0.01} className={inputCls} />
        </div>
      </div>
      {state.fieldErrors?.durationMinutes && <p className="text-xs text-destructive">{state.fieldErrors.durationMinutes}</p>}

      <div className="space-y-1.5">
        <label htmlFor="note" className="block text-sm font-medium">
          Nota <span className="text-muted-foreground text-xs">(opcional)</span>
        </label>
        <textarea id="note" name="note" rows={3} maxLength={2000} className={`${inputCls} resize-none`} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Registrando…" : "Registrar atividade"}
      </button>
    </form>
  );
}
