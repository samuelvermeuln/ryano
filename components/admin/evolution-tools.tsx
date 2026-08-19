"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import {
  disconnectEvolutionInstanceAction,
  refreshEvolutionQrAction,
  sendEvolutionTestMessageAction,
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
};

export function EvolutionTools({
  initialQrCode,
  initialStatus = "desconhecido",
  initialConnected = false,
  initialIdentity = null,
}: EvolutionToolsProps) {
  const router = useRouter();
  const [testState, testAction] = useActionState(sendEvolutionTestMessageAction, initialState);
  const [panelState, setPanelState] = useState<AdminActionState>({
    qrCode: initialQrCode ?? null,
    status: initialStatus,
    connected: initialConnected,
    identity: initialIdentity,
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
