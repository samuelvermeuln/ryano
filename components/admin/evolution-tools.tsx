"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  disconnectEvolutionInstanceAction,
  refreshEvolutionQrAction,
  refreshEvolutionStateAction,
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
    instanceEnsureStatus: null,
  });
  const [webhookEventsValue, setWebhookEventsValue] = useState(initialWebhookEvents);
  const [allowHttpFallbackValue, setAllowHttpFallbackValue] = useState(initialAllowHttpFallback);

  useEffect(() => {
    setWebhookEventsValue(initialWebhookEvents);
    setAllowHttpFallbackValue(initialAllowHttpFallback);
    setPanelState((current) => ({
      ...current,
      status: initialStatus,
      connected: initialConnected,
      identity: initialIdentity,
      phoneE164: initialPhoneE164,
      webhookEvents: initialWebhookEvents,
      allowHttpFallback: initialAllowHttpFallback,
      qrCode: initialConnected ? null : current.qrCode,
    }));
  }, [
    initialAllowHttpFallback,
    initialConnected,
    initialIdentity,
    initialPhoneE164,
    initialStatus,
    initialWebhookEvents,
  ]);

  useEffect(() => {
    if (configState.webhookEvents !== undefined) {
      setWebhookEventsValue(configState.webhookEvents);
    }

    if (configState.allowHttpFallback !== undefined) {
      setAllowHttpFallbackValue(configState.allowHttpFallback);
    }
  }, [configState.allowHttpFallback, configState.webhookEvents]);

  const instanceEnsureStatus = configState.instanceEnsureStatus ?? panelState.instanceEnsureStatus ?? null;
  const qrCodeSrc = panelState.qrCode
    ? panelState.qrCode.startsWith("data:")
      ? panelState.qrCode
      : `data:image/png;base64,${panelState.qrCode}`
    : null;

  return (
    <div className="space-y-6">
      <div className="theme-panel-neutral space-y-4 rounded-[22px] border px-4 py-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={panelState.connected ? "success" : "warning"}>
            {panelState.status ?? "desconhecido"}
          </StatusBadge>
          <StatusBadge>{panelState.connected ? "Conectado" : "Desconectado"}</StatusBadge>
        </div>

        <p>Identidade atual: {panelState.identity ?? "não informada"}</p>
        <p>Número conectado: {panelState.phoneE164 ?? "não detectado"}</p>
        <p>
          Preparação da conexão: {instanceEnsureStatus === "created" ? "criada automaticamente" : instanceEnsureStatus === "existing" ? "já estava pronta" : "sem atualização recente"}
        </p>
        {panelState.message ? <p>{panelState.message}</p> : null}

        {qrCodeSrc && !panelState.connected ? (
          <div className="rounded-[18px] border border-white/10 bg-white p-4 shadow-sm">
            <img src={qrCodeSrc} alt="QR Code do WhatsApp" className="mx-auto h-auto w-full max-w-xs" />
          </div>
        ) : (
          <p>O QR Code aparece somente quando uma nova conexão precisa ser feita.</p>
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
            Atualizar QR Code
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
            Desconectar
          </button>

          <button
            type="button"
            onClick={async () => {
              const result = await refreshEvolutionStateAction();
              setPanelState((current) => ({
                ...current,
                ...result,
                qrCode: result.connected ? null : current.qrCode,
              }));
              router.refresh();
            }}
            className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
          >
            Atualizar dados
          </button>
        </div>
      </div>

      <form action={configAction} className="space-y-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
        <div className="space-y-2 text-sm text-foreground/76">
          <p className="font-medium text-foreground">Ajustes avançados da conexão</p>
          <p>Conta padrão: <span className="font-semibold">ryvano</span>. Se ela ainda não existir, o painel tenta prepará-la automaticamente antes de conectar.</p>
        </div>

        {configState.message ? (
          <div className="theme-panel-neutral rounded-[18px] border px-4 py-3 text-sm">
            {configState.message}
          </div>
        ) : null}

        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground/76">Eventos monitorados</span>
          <div className="glass-input rounded-[20px] px-4 py-3">
            <textarea
              name="events"
              rows={4}
              value={webhookEventsValue}
              onChange={(event) => setWebhookEventsValue(event.target.value)}
              className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
              required
            />
          </div>
          <p className="text-xs text-foreground/55">Separe por vírgula. Ex.: QRCODE_UPDATED, CONNECTION_UPDATE, MESSAGES_UPSERT</p>
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
            checked={allowHttpFallbackValue}
            onChange={(event) => setAllowHttpFallbackValue(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-transparent"
          />
          Permitir conexão local temporária
        </label>

        <SubmitButton
          className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
          pendingLabel="Salvando ajustes..."
        >
          Salvar ajustes
        </SubmitButton>
      </form>

      <form action={testAction} className="space-y-4">
        {testState.message ? (
          <div className="theme-panel-neutral rounded-[22px] border px-4 py-3 text-sm">
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
              defaultValue="Teste de mensagem do ryvano."
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
