"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconPlugConnectedX, IconRefresh } from "@tabler/icons-react";

/**
 * Rota (adapter fino) de desconexão do Strava. Um `DELETE` revoga o token e
 * limpa a conexão STRAVA no servidor, sem afetar outros providers (Req 10.6).
 */
export const STRAVA_DISCONNECT_ROUTE = "/api/integrations/strava/disconnect";

/**
 * Rota (adapter fino) de sincronização manual do Strava. Um `POST` importa as
 * atividades (backfill se a conexão nunca sincronizou, incremental depois).
 */
export const STRAVA_SYNC_ROUTE = "/api/integrations/strava/sync";

export type StravaDisconnectResult = {
  success: boolean;
  message?: string;
};

export type StravaSyncResultNotice = {
  success: boolean;
  message: string;
};

/** Corpo relevante da resposta de `POST /api/integrations/strava/sync`. */
type StravaSyncResponseBody = {
  status?: "synced" | "rate-limited" | "failed";
  syncedCount?: number;
  createdCount?: number;
  /** `code` do erro quando `status === "failed"` (ver `SyncStravaResult`). */
  errorCode?: string;
};

/**
 * Códigos de erro do sync que só se resolvem reautorizando o Strava (espelho de
 * `STRAVA_REAUTH_ERROR_CODES` no módulo; a UI não importa código de servidor).
 */
const REAUTH_ERROR_CODES = new Set(["STRAVA_UNAUTHORIZED", "STRAVA_SCOPE_MISSING"]);

type StravaConnectionManagerProps = {
  /** Scopes concedidos (Req 13.4). Ex.: ["read", "activity:read_all"]. */
  scopes?: readonly string[] | null;
  /** Rótulo de status legível (ex.: "Conectado"). */
  statusLabel?: string;
  /** Data legível da última sincronização, se disponível. */
  lastSyncLabel?: string | null;
  /** Notificação do resultado da desconexão (o pai exibe o banner). */
  onResult?: (result: StravaDisconnectResult) => void;
  /** Notificação do resultado da sincronização manual (o pai exibe o banner). */
  onSyncResult?: (result: StravaSyncResultNotice) => void;
};

function pluralizeActivities(count: number): string {
  return count === 1 ? "1 atividade" : `${count} atividades`;
}

/** Traduz a resposta da rota de sync numa mensagem amigável, sem expor códigos. */
function describeSyncResponse(status: number, body: StravaSyncResponseBody): StravaSyncResultNotice {
  if (status === 429) {
    return { success: false, message: "Muitas sincronizações em pouco tempo. Aguarde alguns minutos e tente de novo." };
  }

  if (status === 404) {
    return { success: false, message: "Conecte sua conta Strava antes de sincronizar." };
  }

  const synced = body.syncedCount ?? 0;
  const created = body.createdCount ?? 0;

  if (status >= 200 && status < 300 && body.status === "synced") {
    return {
      success: true,
      message:
        created > 0
          ? `${pluralizeActivities(created)} nova${created === 1 ? "" : "s"} importada${created === 1 ? "" : "s"} (${pluralizeActivities(synced)} verificada${synced === 1 ? "" : "s"}).`
          : synced > 0
            ? `Nenhuma atividade nova. ${pluralizeActivities(synced)} já estava${synced === 1 ? "" : "m"} em dia.`
            : "Nenhuma atividade encontrada no período sincronizado.",
    };
  }

  if (status >= 200 && status < 300 && body.status === "rate-limited") {
    return {
      success: true,
      message: `O Strava limitou as requisições por agora. Importamos ${pluralizeActivities(synced)} e a importação continua automaticamente.`,
    };
  }

  if (body.errorCode && REAUTH_ERROR_CODES.has(body.errorCode)) {
    return {
      success: false,
      message: "O Strava recusou o acesso às suas atividades. Reconecte sua conta para voltar a importar.",
    };
  }

  return {
    success: false,
    message: "Não foi possível sincronizar agora. Sua conexão continua ativa e tentaremos novamente automaticamente.",
  };
}

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
  onSyncResult,
}: StravaConnectionManagerProps) {
  const router = useRouter();
  const [isDisconnecting, startDisconnect] = useTransition();
  const [isSyncing, startSync] = useTransition();

  const grantedScopes = (scopes ?? []).filter((scope) => scope.trim().length > 0);

  const syncNow = () => {
    startSync(async () => {
      try {
        const response = await fetch(STRAVA_SYNC_ROUTE, { method: "POST" });
        const body = (await response.json().catch(() => ({}))) as StravaSyncResponseBody;

        onSyncResult?.(describeSyncResponse(response.status, body));
        router.refresh();
      } catch {
        onSyncResult?.({
          success: false,
          message: "Não foi possível sincronizar agora. Tente novamente em instantes.",
        });
      }
    });
  };

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

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={syncNow}
          disabled={isSyncing || isDisconnecting}
          aria-busy={isSyncing}
          className="glass-button-primary inline-flex items-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSyncing ? (
            <IconLoader2 size={18} className="animate-spin" />
          ) : (
            <IconRefresh size={18} stroke={1.8} />
          )}
          {isSyncing ? "Sincronizando..." : "Sincronizar agora"}
        </button>

        <button
          type="button"
          onClick={disconnect}
          disabled={isDisconnecting || isSyncing}
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
    </div>
  );
}
