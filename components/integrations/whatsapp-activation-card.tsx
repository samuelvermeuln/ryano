"use client";

import { useActionState } from "react";

import { generateWhatsAppActivationAction, type ActionState } from "@/app/actions/integrations";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};

export function WhatsAppActivationCard({ phone, verified }: { phone: string | null; verified: boolean }) {
  const [state, formAction] = useActionState(generateWhatsAppActivationAction, initialState);

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-foreground/72">
        <p>Telefone cadastrado: {phone ?? "não informado"}.</p>
        <p>Status atual: {verified ? "verificado" : "pendente de verificação"}.</p>
        <p>Fluxo: gerar código, abrir WhatsApp, enviar mensagem, aguardar webhook confirmar remetente.</p>
      </div>

      {state.message ? (
        <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/76">
          <p>{state.message}</p>
          {state.activationUrl ? (
            <a href={state.activationUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-accent hover:text-foreground">
              {state.activationUrl}
            </a>
          ) : null}
          {state.expiresAt ? <p className="mt-2 text-xs text-foreground/55">Expira em: {state.expiresAt}</p> : null}
        </div>
      ) : null}

      <form action={formAction}>
        <SubmitButton className="glass-button-primary rounded-[20px] px-5 py-3 text-sm font-semibold" pendingLabel="Gerando link...">
          Ativar pelo WhatsApp
        </SubmitButton>
      </form>
    </div>
  );
}
