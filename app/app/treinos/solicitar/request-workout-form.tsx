"use client";

import { useActionState } from "react";

import { RYVANO_SPORT_TYPES, getRyvanoSportLabel } from "@/modules/shared/activities/sport-types";
import { requestWorkoutAction, type RequestWorkoutState } from "../actions";

const inputCls = "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const initialState: RequestWorkoutState = {};

export function RequestWorkoutForm({ schools }: { schools: { id: string; name: string }[] }) {
  const [state, action, isPending] = useActionState(requestWorkoutAction, initialState);

  return (
    <form action={action} className="space-y-5">
      {state.message && (
        <p className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">{state.message}</p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="schoolId" className="block text-sm font-medium">
          Escola <span className="text-destructive">*</span>
        </label>
        <select id="schoolId" name="schoolId" required defaultValue="" className={inputCls}>
          <option value="" disabled>Selecione…</option>
          {schools.map((school) => (
            <option key={school.id} value={school.id}>{school.name}</option>
          ))}
        </select>
        {state.fieldErrors?.schoolId && <p className="text-xs text-destructive">{state.fieldErrors.schoolId}</p>}
      </div>

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
        <label htmlFor="preferredDate" className="block text-sm font-medium">
          Data desejada <span className="text-muted-foreground text-xs">(opcional)</span>
        </label>
        <input id="preferredDate" name="preferredDate" type="date" className={inputCls} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="note" className="block text-sm font-medium">
          Observação <span className="text-muted-foreground text-xs">(opcional)</span>
        </label>
        <textarea id="note" name="note" rows={3} maxLength={2000} className={`${inputCls} resize-none`} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Enviando…" : "Enviar solicitação"}
      </button>
    </form>
  );
}
