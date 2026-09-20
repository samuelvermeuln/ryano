"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCoachProfileAction, type CreateCoachProfileState } from "./actions";

const inputCls = "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const initialState: CreateCoachProfileState = {};

export function CreateCoachProfileForm({ onCreated }: { onCreated: () => void }) {
  const [state, action, isPending] = useActionState(createCoachProfileAction, initialState);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  // Trigger onCreated when the action succeeds (no message, no fieldErrors, not initial state)
  const isSubmitted = state !== initialState;
  useEffect(() => {
    if (isSubmitted && !state.message && !state.fieldErrors) {
      onCreatedRef.current();
    }
  }, [isSubmitted, state.message, state.fieldErrors]);

  return (
    <form action={action} className="space-y-5">
      {state.message && (
        <p className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {state.message}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="displayName" className="block text-sm font-medium">
          Como quer ser chamado? <span className="text-destructive">*</span>
        </label>
        <input
          id="displayName" name="displayName" type="text" required maxLength={200}
          placeholder="Ex: Prof. João Silva"
          className={state.fieldErrors?.displayName
            ? inputCls.replace("border-border", "border-destructive")
            : inputCls}
        />
        {state.fieldErrors?.displayName && (
          <p className="text-xs text-destructive">{state.fieldErrors.displayName}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Esse nome aparecerá para seus atletas e nas escolas que você participar.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="bio" className="block text-sm font-medium">
          Apresentação <span className="text-muted-foreground text-xs">(opcional)</span>
        </label>
        <textarea
          id="bio" name="bio" rows={4} maxLength={2000}
          placeholder="Sua especialidade, certificações, anos de experiência, metodologia…"
          className={`${inputCls} resize-none`}
        />
      </div>

      <button
        type="submit" disabled={isPending}
        className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? "Criando perfil…" : "Criar perfil de professor"}
      </button>
    </form>
  );
}


