"use client";

import { useActionState } from "react";

import { sendEvolutionTestImageAction, type AdminActionState } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";

const initialState: AdminActionState = {};

export function EvolutionMediaTestPanel() {
  const [state, action] = useActionState(sendEvolutionTestImageAction, initialState);

  return (
    <form action={action} className="space-y-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
      {state.message ? (
        <div className="theme-panel-neutral rounded-[18px] border px-4 py-3 text-sm">
          {state.message}
        </div>
      ) : null}

      <div className="space-y-2 text-sm text-foreground/76">
        <p className="font-medium text-foreground">Teste de mídia PNG</p>
        <p>Envia um card gráfico de diagnóstico direto pela Evolution para validar payload, variante e transporte de imagem sem depender do job diário.</p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground/76">Telefone de teste</span>
        <div className="glass-input rounded-[20px] px-4 py-3">
          <input
            name="phone"
            type="text"
            placeholder="5511999990000"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
            required
          />
        </div>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground/76">Caption</span>
        <div className="glass-input rounded-[20px] px-4 py-3">
          <textarea
            name="caption"
            rows={3}
            defaultValue="Diagnóstico gráfico da Evolution x Ryvano."
            className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
          />
        </div>
      </label>

      {state.transportDebug ? (
        <div className="rounded-[20px] border border-cyan-300/12 bg-cyan-400/8 px-4 py-4 text-xs leading-6 text-foreground/76">
          <p><span className="font-semibold text-foreground">Modo:</span> {state.transportDebug.mode}</p>
          <p className="break-words"><span className="font-semibold text-foreground">Endpoint:</span> {state.transportDebug.endpoint}</p>
          <p><span className="font-semibold text-foreground">Variante:</span> {state.transportDebug.variant ?? "—"}</p>
          <p className="break-words"><span className="font-semibold text-foreground">Tentativas:</span> {state.transportDebug.attempts?.length ? state.transportDebug.attempts.join(" | ") : "—"}</p>
          <p className="break-words"><span className="font-semibold text-foreground">Detalhe:</span> {state.transportDebug.errorDetail ?? "—"}</p>
        </div>
      ) : null}

      <SubmitButton
        className="glass-button-primary rounded-[20px] px-5 py-3 text-sm font-semibold"
        pendingLabel="Enviando PNG de teste..."
      >
        Enviar imagem de teste
      </SubmitButton>
    </form>
  );
}
