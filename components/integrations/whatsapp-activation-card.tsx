"use client";

import { useActionState } from "react";

import { generateWhatsAppActivationAction, type ActionState } from "@/app/actions/integrations";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/format";

const initialState: ActionState = {};

export function WhatsAppActivationCard({ phone, verified }: { phone: string | null; verified: boolean }) {
  const [state, formAction] = useActionState(generateWhatsAppActivationAction, initialState);

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-foreground/72">
        <p>Número confirmado: {phone ?? "adicione seu telefone para continuar"}.</p>
        <p>Status atual: {verified ? "WhatsApp conectado" : "Aguardando confirmação"}.</p>
      </div>

      <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-foreground/72">
        <p>1. Confirme seu número</p>
        <p>2. Abra o WhatsApp</p>
        <p>3. Envie a mensagem de confirmação</p>
        <p>4. Pronto</p>
      </div>

      {state.message ? (
        <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/76">
          <p>{state.message}</p>

          {state.activationUrl ? (
            <div className="mt-3 space-y-3">
              <a
                href={state.activationUrl}
                target="_blank"
                rel="noreferrer"
                className="glass-button-primary inline-flex rounded-[16px] px-4 py-2 text-sm font-semibold"
              >
                Abrir WhatsApp e enviar mensagem
              </a>

              <div>
                <p className="text-xs text-foreground/55">Se botão não abrir, use link manual:</p>
                <a
                  href={state.activationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block break-all text-accent underline hover:text-foreground"
                >
                  {state.activationUrl}
                </a>
              </div>
            </div>
          ) : null}

          {state.expiresAt ? <p className="mt-3 text-xs text-foreground/55">Expira em: {formatDateTime(state.expiresAt)}</p> : null}
        </div>
      ) : null}

      {!verified ? (
        <form action={formAction}>
          <SubmitButton className="glass-button-primary rounded-[18px] px-5 py-3 text-sm font-semibold" pendingLabel="Gerando confirmação...">
            Confirmar pelo WhatsApp
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
