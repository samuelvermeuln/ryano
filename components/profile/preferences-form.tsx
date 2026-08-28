"use client";

import { useActionState } from "react";

import { savePreferencesAction, type ActionState } from "@/app/actions/profile";
import { ThemeToggle } from "@/components/theme-toggle";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};

type PreferencesFormProps = {
  preference: {
    postActivityReport: boolean;
    dailySummary: boolean;
    weeklySummary: boolean;
    enabled: boolean;
    reportTime: string | null;
    timezone: string | null;
  } | null;
};

export function PreferencesForm({ preference }: PreferencesFormProps) {
  const [state, formAction] = useActionState(savePreferencesAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? (
        <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/76">
          {state.message}
        </div>
      ) : null}

      <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Tema visual</p>
            <p className="mt-1 text-sm leading-7 text-foreground/72">Escolha entre claro e escuro. Preferência fica salva neste navegador.</p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <Checkbox name="enabled" defaultChecked={preference?.enabled ?? true} label="Mensageria habilitada" />
      <Checkbox name="postActivityReport" defaultChecked={preference?.postActivityReport ?? true} label="Relatório após atividade" />
      <Checkbox name="dailySummary" defaultChecked={preference?.dailySummary ?? false} label="Resumo diário" />
      <Checkbox name="weeklySummary" defaultChecked={preference?.weeklySummary ?? false} label="Resumo semanal" />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground/76">Horário preferido</span>
          <div className="glass-input rounded-[20px] px-4 py-3">
            <input name="reportTime" type="time" defaultValue={preference?.reportTime ?? "18:00"} className="w-full bg-transparent text-sm text-foreground outline-none" />
          </div>
        </label>

        <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground/72">
          Referência de horário fixa da plataforma.
        </div>
      </div>
+
+      <input name="timezone" type="hidden" value="UTC" />

      <SubmitButton className="glass-button-primary rounded-[20px] px-5 py-3 text-sm font-semibold" pendingLabel="Salvando preferências...">
        Salvar preferências
      </SubmitButton>
    </form>
  );
}

function Checkbox({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <label className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground/76">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4 accent-[oklch(0.72_0.16_230)]" />
      <span>{label}</span>
    </label>
  );
}
