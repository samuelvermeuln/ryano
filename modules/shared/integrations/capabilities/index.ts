/**
 * Contrato de capabilities dos providers e helpers de consulta.
 *
 * O core decide o que renderizar/processar por capability declarada, nunca por
 * `if (provider === "X")`. Assim, adicionar um novo provider não exige alterar
 * os componentes do core.
 *
 * O lookup das capabilities de um provider vem do catálogo
 * (`modules/shared/integrations/catalog`). Para evitar dependência circular
 * (o catálogo importa este módulo para reusar `ProviderCapabilities`), o
 * catálogo registra seu resolver via `setProviderCapabilitiesResolver`.
 *
 * _Requisitos: 2.1, 2.2, 2.4_
 */

import type { ProviderId } from "@/modules/shared/integrations/types";

/**
 * Capacidades que um provider pode declarar. Todas opcionais: a ausência de uma
 * capability significa que o provider não a fornece, e o core deve omitir a
 * funcionalidade correspondente em vez de falhar.
 */
export interface ProviderCapabilities {
  /** Lista/importa atividades (treinos). */
  activities?: boolean;
  /** Detalhe rico de uma atividade específica. */
  activityDetails?: boolean;
  /** Métricas diárias de bem-estar (ex.: Body Battery). */
  dailyWellness?: boolean;
  /** Prontidão de recuperação. */
  recovery?: boolean;
  /** Dados de sono. */
  sleep?: boolean;
  /** Variabilidade da frequência cardíaca. */
  hrv?: boolean;
  /** Training readiness / prontidão. */
  readiness?: boolean;
  /** Séries temporais por atividade (ex.: FC/potência por segundo). */
  streams?: boolean;
  /** Voltas/segmentos por atividade. */
  laps?: boolean;
  /** Zonas de frequência cardíaca. */
  heartRateZones?: boolean;
  /** Zonas de potência. */
  powerZones?: boolean;
  /** Recebe eventos via webhook. */
  webhooks?: boolean;
  /** Autentica via OAuth. */
  oauth?: boolean;
  /** Envia treinos planejados/estruturados para o dispositivo do atleta. */
  plannedWorkoutPush?: boolean;
}

/** Nome de uma capability declarável por um provider. */
export type CapabilityKey = keyof ProviderCapabilities;

/**
 * Resolve as capabilities declaradas de um provider, ou `undefined` se o
 * provider não estiver registrado.
 */
export type ProviderCapabilitiesResolver = (
  providerId: ProviderId,
) => ProviderCapabilities | undefined;

const emptyResolver: ProviderCapabilitiesResolver = () => undefined;

let capabilitiesResolver: ProviderCapabilitiesResolver = emptyResolver;

/**
 * Registra a fonte de capabilities dos providers (tipicamente o catálogo).
 *
 * Mantém o módulo de capabilities desacoplado do catálogo, evitando dependência
 * circular. Chamado uma vez na inicialização do core.
 */
export function setProviderCapabilitiesResolver(
  resolver: ProviderCapabilitiesResolver,
): void {
  capabilitiesResolver = resolver;
}

/**
 * Restaura o resolver padrão (sem capabilities). Útil em testes.
 */
export function resetProviderCapabilitiesResolver(): void {
  capabilitiesResolver = emptyResolver;
}

/**
 * Retorna as capabilities declaradas de um provider (objeto vazio se
 * desconhecido).
 */
export function getProviderCapabilities(
  providerId: ProviderId,
): ProviderCapabilities {
  return capabilitiesResolver(providerId) ?? {};
}

/**
 * Indica se um provider fornece uma capability específica.
 *
 * Consulta a capability declarada do provider (via catálogo), não o
 * identificador do provider.
 *
 * _Requisitos: 2.1, 2.2_
 */
export function hasCapability(
  providerId: ProviderId,
  capability: CapabilityKey,
): boolean {
  return getProviderCapabilities(providerId)[capability] === true;
}

/**
 * Retorna a união das capabilities de todos os providers conectados.
 *
 * Uma capability é considerada presente para o usuário se pelo menos um dos
 * providers conectados a fornecer. Usado pelo core para decidir seções
 * opcionais (dashboard, relatórios) sem citar um provider específico.
 *
 * _Requisitos: 2.2, 2.4_
 */
export function getUserCapabilities(
  connectedProviders: readonly ProviderId[],
): ProviderCapabilities {
  const union: ProviderCapabilities = {};

  for (const providerId of connectedProviders) {
    const capabilities = getProviderCapabilities(providerId);
    for (const [key, value] of Object.entries(capabilities)) {
      if (value === true) {
        union[key as CapabilityKey] = true;
      }
    }
  }

  return union;
}

/**
 * Indica se pelo menos um dos providers conectados fornece a capability.
 *
 * Atalho para `getUserCapabilities(...)[capability] === true`.
 *
 * _Requisitos: 2.4_
 */
export function userHasCapability(
  connectedProviders: readonly ProviderId[],
  capability: CapabilityKey,
): boolean {
  return connectedProviders.some((providerId) =>
    hasCapability(providerId, capability),
  );
}
