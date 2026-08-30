"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";

import type { IntegrationCardViewModel } from "@/modules/shared/integrations/presentation";
import { StravaConnectButton } from "./strava-connect-button";
import {
  StravaConnectionManager,
  type StravaDisconnectResult,
} from "./strava-connection-manager";

type NoticeTone = "success" | "warning" | "danger" | "neutral";

export type StravaCardNotice = {
  tone: NoticeTone;
  title: string;
  description: string;
};

type StravaProviderCardProps = {
  card: IntegrationCardViewModel;
  /** Scopes concedidos, para a tela de gerenciamento (Req 13.4). */
  scopes?: readonly string[] | null;
  /** Data legível da última sincronização. */
  lastSyncLabel?: string | null;
  /** Notificação externa (ex.: resultado do callback OAuth) a exibir no card. */
  notice?: StravaCardNotice | null;
};

const noticeToneClassMap: Record<NoticeTone, string> = {
  neutral: "theme-panel-neutral",
  success: "theme-panel-success",
  warning: "theme-panel-warning",
  danger: "theme-panel-danger",
};

/**
 * Card dedicado do Strava na tela de Integrações (Req 13.3, 13.4, 13.7, 13.8).
 *
 * Compõe os componentes de apresentação do módulo Strava (botão de conexão e
 * tela de gerenciamento) mantendo o visual consistente com os demais cards do
 * hub. A UI permanece agnóstica a OAuth: conectar navega para a rota de connect;
 * desconectar chama o `DELETE` da rota; ambas as responsabilidades ficam no
 * servidor/módulo.
 */
export function StravaProviderCard({
  card,
  scopes,
  lastSyncLabel,
  notice,
}: StravaProviderCardProps) {
  const [localNotice, setLocalNotice] = useState<StravaCardNotice | null>(null);
  const activeNotice = localNotice ?? notice ?? null;

  const needsReconnect = card.action === "RECONNECT";
  const badge = needsReconnect
    ? { cls: "theme-pill-warning", label: "Reconectar" }
    : card.connected
      ? { cls: "theme-pill-success", label: "Conectado" }
      : { cls: "theme-pill-neutral", label: "Disponível" };

  const handleDisconnectResult = (result: StravaDisconnectResult) => {
    setLocalNotice(
      result.success
        ? {
            tone: "success",
            title: "Strava desconectado",
            description: "Suas atividades já importadas permanecem na sua conta.",
          }
        : {
            tone: "warning",
            title: "Não foi possível desconectar agora",
            description: result.message ?? "Tente novamente em instantes.",
          },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#fc4c02]/20 bg-[#fc4c02]/10 shadow-[0_12px_28px_rgba(252,76,2,0.14)]">
            <Icon icon="simple-icons:strava" className="h-6 w-6 text-[#fc4c02]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{card.name}</h3>
            <p className="text-sm text-foreground/58">Treinos e atividades</p>
          </div>
        </div>

        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="mt-6 space-y-5">
        <p className="text-sm leading-7 text-foreground/66">{card.description}</p>

        {activeNotice ? (
          <div
            aria-live="polite"
            className={`rounded-[22px] border px-4 py-4 text-sm ${noticeToneClassMap[activeNotice.tone]}`}
          >
            <p className="font-semibold text-foreground">{activeNotice.title}</p>
            <p className="mt-1 leading-6 text-foreground/76">{activeNotice.description}</p>
          </div>
        ) : null}

        {card.connected && !needsReconnect ? (
          <StravaConnectionManager
            scopes={scopes}
            statusLabel="Conectado"
            lastSyncLabel={lastSyncLabel}
            onResult={handleDisconnectResult}
          />
        ) : needsReconnect ? (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.045] px-5 py-5">
            <p className="text-sm leading-7 text-foreground/68">
              Sua conexão com o Strava precisa ser validada novamente para continuar importando suas atividades.
            </p>
            <div className="mt-4">
              <StravaConnectButton reconnect />
            </div>
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.04] px-5 py-5">
            <p className="text-lg font-semibold text-foreground">Importe seus treinos automaticamente.</p>
            <p className="mt-2 max-w-xl text-sm leading-7 text-foreground/66">
              Conecte sua conta {card.name} e deixe a RYVANO acompanhar suas atividades sem precisar enviar nada manualmente.
            </p>
            <div className="mt-5">
              <StravaConnectButton />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
