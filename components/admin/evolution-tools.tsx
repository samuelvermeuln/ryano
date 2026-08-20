"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import {
  disconnectEvolutionInstanceAction,
  refreshEvolutionQrAction,
  sendEvolutionTestMessageAction,
  updateEvolutionWebhookConfigAction,
  type AdminActionState,
} from "@/app/actions/admin";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";

const initialState: AdminActionState = {};

type EvolutionToolsProps = {
  initialQrCode?: string | null;
  initialStatus?: string;
  initialConnected?: boolean;
  initialIdentity?: string | null;
  initialPhoneE164?: string | null;
  initialWebhookEvents?: string;
  initialAllowHttpFallback?: boolean;
};

export function EvolutionTools({
  initialQrCode,
  initialStatus = "desconhecido",
  initialConnected = false,
  initialIdentity = null,
  initialPhoneE164 = null,
  initialWebhookEvents = "",
  initialAllowHttpFallback = true,
}: EvolutionToolsProps) {
  const router = useRouter();
  const [testState, testAction] = useActionState(sendEvolutionTestMessageAction, initialState);
  const [configState, configAction] = useActionState(updateEvolutionWebhookConfigAction, {
    webhookEvents: initialWebhookEvents,
    allowHttpFallback: initialAllowHttpFallback,
  });
  const [panelState, setPanelState] = useState<AdminActionState>({
    qrCode: initialQrCode ?? null,
    status: initialStatus,
    connected: initialConnected,
    identity: initialIdentity,
    phoneE164: initialPhoneE164,
    webhookEvents: initialWebhookEvents,
    allowHttpFallback: initialAllowHttpFallback,
  });

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground/76">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={panelState.connected ? "success" : "warning"}>
            {panelState.status ?? "desconhecido"}
          </StatusBadge>
          <StatusBadge>{panelState.connected ? "connected" : "disconnected"}</StatusBadge>
        </div>

        <p>Identidade atual: {panelState.identity ?? "não informada"}</p>
        <p>Número conectado: {panelState.phoneE164 ?? "não detectado"}</p>
        {panelState.message ? <p>{panelState.message}</p> : null}

        {panelState.qrCode && !panelState.connected ? (
          <pre className="overflow-x-auto rounded-[18px] border border-white/10 bg-black/20 p-4 text-xs leading-6 text-foreground/75">
            {panelState.qrCode}
          </pre>
        ) : (
          <p>QR oculto quando a instância já está conectada ou quando nenhum código está disponível.</p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={async () => {
              const result = await refreshEvolutionQrAction();
              setPanelState(result);
              router.refresh();
            }}
            className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
          >
            Atualizar QR / reconnect
          </button>

          <button
            type="button"
            onClick={async () => {
              const result = await disconnectEvolutionInstanceAction();
              setPanelState(result);
              router.refresh();
            }}
            className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
          >
            Desconectar instância
          </button>

          <button
            type="button"
            onClick={() => router.refresh()}
            className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
          >
            Atualizar painel
          </button>
        </div>
      </div>

      <form action={configAction} className="space-y-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
        <div className="space-y-2 text-sm text-foreground/76">
          <p className="font-medium text-foreground">Webhook da Evolution</p>
          <p>Instance default: <span className="font-semibold">ryano</span>. Eventos abaixo podem ser ajustados pelo painel admin.</p>
        </div>

        {configState.message ? (
          <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/76">
            {configState.message}
          </div>
        ) : null}

        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground/76">Eventos do webhook</span>
          <div className="glass-input rounded-[20px] px-4 py-3">
            <textarea
              name="events"
              rows={4}
              defaultValue={panelState.webhookEvents ?? initialWebhookEvents}
              className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
              required
            />
          </div>
          <p className="text-xs text-foreground/55">Separar por vírgula. Ex.: QRCODE_UPDATED,CONNECTION_UPDATE,MESSAGES_UPSERT</p>
        </label>

        <label className="flex items-center gap-3 text-sm text-foreground/76">
          <input
            type="hidden"
            name="allowHttpFallback"
            value="false"
          />
          <input
            type="checkbox"
            name="allowHttpFallback"
            value="true"
            defaultChecked={panelState.allowHttpFallback ?? initialAllowHttpFallback}
            className="h-4 w-4 rounded border-white/20 bg-transparent"
          />
          Permitir fallback HTTP para webhook local
        </label>

        <SubmitButton
          className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
          pendingLabel="Aplicando webhook..."
        >
          Aplicar configuração de webhook
        </SubmitButton>
      </form>

      <form action={testAction} className="space-y-4">
        {testState.message ? (
          <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/76">
            {testState.message}
          </div>
        ) : null}

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
          <span className="text-sm font-medium text-foreground/76">Mensagem</span>
          <div className="glass-input rounded-[20px] px-4 py-3">
            <textarea
              name="text"
              rows={4}
              defaultValue="Teste operacional RYANO via Evolution."
              className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
              required
            />
          </div>
        </label>

        <SubmitButton
          className="glass-button-primary rounded-[20px] px-5 py-3 text-sm font-semibold"
          pendingLabel="Enviando teste..."
        >
          Enviar mensagem de teste
        </SubmitButton>
      </form>
    </div>
  );
}
