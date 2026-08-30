/**
 * View-models de apresentação da tela de Integrações, montados a partir do
 * catálogo central + conexões do usuário.
 *
 * Esta camada é provider-agnostic: a UI itera sobre os view-models sem conhecer
 * detalhes de OAuth/credenciais de cada provider. O roteamento do fluxo de
 * conexão (`ConnectIntegration(providerId)`) delega ao módulo correto na camada
 * cliente — a UI apenas dispara a ação genérica.
 *
 * _Requisitos: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_
 */

import {
  PROVIDERS,
  isProviderEnabled,
} from "@/modules/shared/integrations/catalog";
import type {
  ProviderAvailability,
  ProviderId,
} from "@/modules/shared/integrations/types";

/**
 * Ação oferecida por um card de integração.
 *
 * - `CONNECT`: provider disponível e desconectado — inicia conexão.
 * - `MANAGE`: provider conectado e saudável — gerenciar a conexão.
 * - `RECONNECT`: provider conectado mas o status exige nova validação.
 * - `COMING_SOON`: provider indisponível — sem ação de conexão.
 */
export type IntegrationCardAction =
  | "CONNECT"
  | "MANAGE"
  | "RECONNECT"
  | "COMING_SOON";

/**
 * Datas relevantes por conexão, expostas de forma genérica (provider-agnostic).
 * Todas serializadas como ISO strings para atravessar o boundary server→client.
 */
export interface IntegrationCardDates {
  lastSyncAt?: string | null;
  lastEventAt?: string | null;
  lastSuccessAt?: string | null;
  lastErrorAt?: string | null;
}

/**
 * View-model genérico de um card de integração (design 13.2).
 *
 * Contém apenas metadados provider-agnostic: nenhum campo específico de
 * protocolo (OAuth, credenciais) aparece aqui.
 */
export interface IntegrationCardViewModel {
  provider: ProviderId;
  name: string;
  description: string;
  availability: ProviderAvailability;
  connected: boolean;
  status?: string | null;
  dates?: IntegrationCardDates;
  action: IntegrationCardAction;
}

/**
 * Cards agrupados por seção da tela de integrações.
 */
export interface IntegrationCardGroups {
  /** Providers conectados (status !== DISCONNECTED). */
  connected: IntegrationCardViewModel[];
  /** Providers disponíveis para conectar (AVAILABLE + habilitado + desconectado). */
  available: IntegrationCardViewModel[];
  /** Providers "em breve" (COMING_SOON, ou AVAILABLE porém desabilitado por flag). */
  comingSoon: IntegrationCardViewModel[];
}

/**
 * Resumo mínimo de uma conexão de wearable do usuário, o suficiente para montar
 * os cards. `provider` é `string` para tolerar valores do enum Prisma que ainda
 * não existem no catálogo (ex.: `APPLE`) — eles simplesmente não casam com
 * nenhum card.
 */
export interface UserConnectionSummary {
  provider: string;
  status: string;
  lastSyncAt?: string | null;
  lastEventAt?: string | null;
  lastSuccessAt?: string | null;
  lastErrorAt?: string | null;
}

/** Status que sinalizam necessidade de reconectar/revalidar a conexão. */
const RECONNECT_STATUSES = new Set(["RECONNECT_REQUIRED", "REAUTH_REQUIRED"]);

/** Status que representam uma conexão efetivamente ativa (não desconectada). */
function isConnectedStatus(status: string | undefined): boolean {
  return status !== undefined && status !== "DISCONNECTED";
}

function toDates(connection: UserConnectionSummary): IntegrationCardDates {
  return {
    lastSyncAt: connection.lastSyncAt ?? null,
    lastEventAt: connection.lastEventAt ?? null,
    lastSuccessAt: connection.lastSuccessAt ?? null,
    lastErrorAt: connection.lastErrorAt ?? null,
  };
}

/**
 * Monta os cards da tela de integrações a partir do catálogo (`PROVIDERS`)
 * combinado com as conexões do usuário, respeitando `isProviderEnabled` para o
 * gating de fluxos de conexão reais.
 *
 * Regras de `action`:
 * - conectado → `MANAGE` (ou `RECONNECT` quando o status exigir);
 * - disponível + habilitado + desconectado → `CONNECT`;
 * - indisponível (COMING_SOON/DISABLED/flag desligada) → `COMING_SOON`.
 *
 * A tela funciona para qualquer combinação (Strava conectado sem Garmin e
 * vice-versa): nenhum provider é tratado como obrigatório.
 *
 * _Requisitos: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_
 */
export function buildIntegrationCards(
  connections: readonly UserConnectionSummary[],
): IntegrationCardGroups {
  const connectionByProvider = new Map<string, UserConnectionSummary>();
  for (const connection of connections) {
    connectionByProvider.set(connection.provider, connection);
  }

  const groups: IntegrationCardGroups = {
    connected: [],
    available: [],
    comingSoon: [],
  };

  for (const provider of PROVIDERS) {
    const connection = connectionByProvider.get(provider.id);
    const connected = isConnectedStatus(connection?.status);
    const enabled = isProviderEnabled(provider.id);

    const base = {
      provider: provider.id,
      name: provider.name,
      description: provider.description,
      availability: provider.availability,
      status: connection?.status ?? null,
      dates: connection ? toDates(connection) : undefined,
    };

    if (connected) {
      const action: IntegrationCardAction =
        connection && RECONNECT_STATUSES.has(connection.status)
          ? "RECONNECT"
          : "MANAGE";
      groups.connected.push({ ...base, connected: true, action });
      continue;
    }

    if (enabled) {
      groups.available.push({ ...base, connected: false, action: "CONNECT" });
      continue;
    }

    groups.comingSoon.push({
      ...base,
      connected: false,
      action: "COMING_SOON",
    });
  }

  return groups;
}
