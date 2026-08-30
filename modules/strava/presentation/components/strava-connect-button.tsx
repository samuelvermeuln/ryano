"use client";

import { useState } from "react";
import { IconExternalLink, IconLoader2, IconRefresh } from "@tabler/icons-react";

/**
 * Rota (adapter fino) que inicia o fluxo OAuth do Strava. O `GET` responde com
 * um redirect (302) para a authorize URL do Strava — ver
 * `app/api/integrations/strava/connect/route.ts`.
 *
 * A UI NÃO conhece nenhum detalhe de OAuth (Req 13.8): ela apenas navega até
 * esta rota e o servidor cuida do resto.
 */
export const STRAVA_CONNECT_ROUTE = "/api/integrations/strava/connect";

type StravaConnectButtonProps = {
  /** Rótulo customizado; por padrão "Conectar com Strava"/"Reconectar Strava". */
  label?: string;
  /** Estiliza/rotula como reconexão em vez de primeira conexão. */
  reconnect?: boolean;
  /** Classe do botão (default: estilo primário consistente com o hub). */
  className?: string;
};

/**
 * Botão "Conectar com Strava" (Req 13.3, 13.7, 13.8).
 *
 * Inicia o OAuth apenas navegando até a rota de connect (redirect no servidor).
 * O componente não monta authorize URL, não conhece scopes nem `state` — a
 * responsabilidade de OAuth fica inteiramente no módulo/rota do servidor.
 */
export function StravaConnectButton({
  label,
  reconnect = false,
  className,
}: StravaConnectButtonProps) {
  const [redirecting, setRedirecting] = useState(false);

  const text = label ?? (reconnect ? "Reconectar Strava" : "Conectar com Strava");

  const startConnect = () => {
    setRedirecting(true);
    // Navegação de página inteira: a rota faz o redirect (302) ao Strava.
    window.location.assign(STRAVA_CONNECT_ROUTE);
  };

  return (
    <button
      type="button"
      onClick={startConnect}
      disabled={redirecting}
      aria-busy={redirecting}
      className={
        className ??
        "glass-button-primary inline-flex items-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold"
      }
    >
      {redirecting ? (
        <IconLoader2 size={18} className="animate-spin" />
      ) : reconnect ? (
        <IconRefresh size={18} stroke={1.8} />
      ) : (
        <IconExternalLink size={18} stroke={1.8} />
      )}
      {redirecting ? "Redirecionando..." : text}
    </button>
  );
}
