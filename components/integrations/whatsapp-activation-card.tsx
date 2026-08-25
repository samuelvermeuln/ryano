"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { generateWhatsAppActivationAction, type ActionState } from "@/app/actions/integrations";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/format";

const initialState: ActionState = {};
const ACTIVATION_CHECK_INTERVAL_MS = 20_000;
const ACTIVATION_CHECK_WINDOW_MS = 60_000;
const ACTIVATION_MAX_CHECKS = ACTIVATION_CHECK_WINDOW_MS / ACTIVATION_CHECK_INTERVAL_MS;

type ActivationMonitorState = "idle" | "checking" | "confirmed" | "timed_out";

type ActivationStatusResponse = {
  verified?: boolean;
};

export function WhatsAppActivationCard({ phone, verified }: { phone: string | null; verified: boolean }) {
  const router = useRouter();
  const [state, formAction] = useActionState(generateWhatsAppActivationAction, initialState);
  const [isVerified, setIsVerified] = useState(verified);
  const [monitorState, setMonitorState] = useState<ActivationMonitorState>(verified ? "confirmed" : "idle");
  const [checksCompleted, setChecksCompleted] = useState(0);

  useEffect(() => {
    if (!state.activationUrl || !state.expiresAt || isVerified) {
      return;
    }

    let active = true;

    const readStatus = async () => {
      const response = await fetch("/api/whatsapp/activation/status", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("WHATSAPP_ACTIVATION_STATUS_CHECK_FAILED");
      }

      return response.json() as Promise<ActivationStatusResponse>;
    };

    const confirmActivation = () => {
      if (!active) {
        return;
      }

      stop();
      setIsVerified(true);
      setMonitorState("confirmed");
      router.refresh();
    };

    const runCheck = async () => {
      try {
        const payload = await readStatus();

        if (payload.verified) {
          confirmActivation();
          return true;
        }
      } catch {
        return false;
      }

      return false;
    };

    const cancelActivation = async () => {
      try {
        await fetch("/api/whatsapp/activation/status", {
          method: "DELETE",
        });
      } finally {
        if (!active) {
          return;
        }

        stop();
        setMonitorState("timed_out");
      }
    };

    queueMicrotask(() => {
      if (!active) {
        return;
      }

      setMonitorState("checking");
      setChecksCompleted(0);
    });

    const intervalId = window.setInterval(() => {
      setChecksCompleted((current) => Math.min(current + 1, ACTIVATION_MAX_CHECKS));
      void runCheck();
    }, ACTIVATION_CHECK_INTERVAL_MS);

    const timeoutId = window.setTimeout(async () => {
      const confirmed = await runCheck();

      if (!confirmed) {
        await cancelActivation();
      }
    }, ACTIVATION_CHECK_WINDOW_MS);

    const stop = () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };

    return () => {
      active = false;
      stop();
    };
  }, [isVerified, router, state.activationUrl, state.expiresAt]);

  const showActivationLink = Boolean(state.activationUrl && !isVerified && monitorState !== "timed_out");

  return (
    <div className="space-y-4">
      <div className="theme-panel-neutral rounded-[20px] border px-4 py-4 text-sm leading-7">
        <p>Número confirmado: {phone ?? "adicione seu telefone para continuar"}.</p>
        <p>Status atual: {isVerified ? "WhatsApp conectado" : "Aguardando confirmação"}.</p>
      </div>

      <div className="theme-panel-neutral rounded-[20px] border px-4 py-4 text-sm leading-7">
        <p>1. Confirme seu número</p>
        <p>2. Abra o WhatsApp</p>
        <p>3. Envie a mensagem de confirmação</p>
        <p>4. Pronto</p>
      </div>

      {state.message ? (
        <div className="theme-panel-neutral rounded-[20px] border px-4 py-3 text-sm">
          <p>{state.message}</p>

          {monitorState === "checking" ? (
            <div className="mt-3 space-y-1 text-xs text-foreground/55">
              <p>Estamos verificando sua confirmação a cada 20 segundos.</p>
              <p>Tentativas automáticas: {checksCompleted}/{ACTIVATION_MAX_CHECKS}. Tempo máximo: 1 minuto.</p>
            </div>
          ) : null}

          {monitorState === "confirmed" ? <p className="mt-3 text-sm font-medium text-foreground">WhatsApp confirmado. Atualizando tela...</p> : null}

          {monitorState === "timed_out" ? (
            <p className="mt-3 text-sm font-medium text-foreground">
              Não conseguimos confirmar em 1 minuto. Código cancelado. Reinicie processo para gerar novo link.
            </p>
          ) : null}

          {showActivationLink ? (
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

          {state.expiresAt && monitorState !== "timed_out" ? <p className="mt-3 text-xs text-foreground/55">Expira em: {formatDateTime(state.expiresAt)}</p> : null}
        </div>
      ) : null}

      {!isVerified ? (
        <form action={formAction}>
          <SubmitButton
            className="glass-button-primary rounded-[18px] px-5 py-3 text-sm font-semibold"
            pendingLabel="Gerando confirmação..."
            disabled={monitorState === "checking"}
          >
            {monitorState === "checking" ? "Verificando confirmação..." : "Confirmar pelo WhatsApp"}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
