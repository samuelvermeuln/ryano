"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconPlugConnectedX } from "@tabler/icons-react";

/**
 * Rota (adapter fino) de desconexão do Strava. Um `DELETE` revoga o token e
 * limpa a conexão STRAVA no servidor, sem afetar outros providers (Req 10.6).
 */
export const STRAVA_DISCONNECT_ROUTE = "/api/integrations/strava/disconnect";

export type StravaDisconnectResult = {
  success: boolean;
  message?: string;
};

type StravaConnectionManagerProps = {
  /** Scopes concedidos (Req 13.4). Ex.: ["read", "activity:read_all"]. */
  scopes?: readonly string[] | null;
  /** Rótulo de status legível (ex.: "Conectado"). */
  statusLabel?: string;
  /** Data legível da última sincronização, se disponível. */
  lastSyncLabel?: string | null;
  /** Notificação do resultado da desconexão (o pai exibe o banner). */
  onResult?: (result: StravaDisconnectResult) => void;
};

/**
 * Rótulos amigáveis para os scopes do Strava. Baseados na documentação oficial
 * de autenticação do Strava. Scopes desconhecidos caem no valor bruto.
 * (Conteúdo parafraseado para conformidade com licenciamento.)
 */
const SCOPE_LABELS: Record<string, string> = {
  read: "Perfil público",
  read_all: "Perfil e dados privados",
  "profile:read_all": "Perfil completo",
  "profile:write": "Editar perfil",
  "activity:read": "Atividades públicas",
  "activity:read_all": "Todas as atividades",
  "activity:write": "Registrar atividades",
};

function formatScope(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}

/**
 * Tela de gerenciamento da conexão Strava (Req 13.4, 13.7).
 *
 * Mostra o status, os scopes concedidos e um botão para desconectar. A
 * desconexão chama o `DELETE` da rota (o servidor revoga e limpa) e então
 * atualiza a página via `router.refresh()`. A UI não conhece OAuth.
 */
export function StravaConnectionManager({
  scopes,
  statusLabel = "Conectado",
  lastSyncLabel,
  onResult,
}: StravaConnectionManagerProps) {
  const router = useRouter();
  const [isDisconnecting, startDisconnect] = useTransition();

  const grantedScopes = (scopes ?? []).filter((scope) => scope.trim().length > 0);

  const disconnect = () => {
    startDisconnect(async () => {
      try {
        const response = await fetch(STRAVA_DISCONNECT_ROUTE, { method: "DELETE" });

        if (!response.ok) {
          throw new Error("STRAVA_DISCONNECT_FAILED");
        }

        onResult?.({ success: true });
        router.refresh();
      } catch {
        onResult?.({
          success: false,
          message: "Não foi possível desconectar agora. Tente novamente em instantes.",
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-white/10 bg-white/[0.045] px-5 py-5">
        <p className="text-sm leading-7 text-foreground/68">
          Strava conectado. Suas atividades são importadas automaticamente.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground/48">Status</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{statusLabel}</p>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground/48">Última sincronização</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{lastSyncLabel ?? "Aguardando"}</p>
          </div>
        </div>

        {grantedScopes.length > 0 ? (
          <div className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground/48">Permissões concedidas</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {grantedScopes.map((scope) => (
                <li
                  key={scope}
                  className="inline-flex items-center rounded-full border border-cyan-300/16 bg-cyan-400/8 px-3 py-1 text-xs font-medium text-foreground/82"
                  title={scope}
                >
                  {formatScope(scope)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={disconnect}
        disabled={isDisconnecting}
        aria-busy={isDisconnecting}
        className="inline-flex items-center gap-2 rounded-[18px] border border-red-400/20 bg-red-500/14 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isDisconnecting ? (
          <IconLoader2 size={18} className="animate-spin" />
        ) : (
          <IconPlugConnectedX size={18} stroke={1.8} />
        )}
        {isDisconnecting ? "Desconectando..." : "Desconectar Strava"}
      </button>
    </div>
  );
}
