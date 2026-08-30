/**
 * Catálogo central e extensível de providers esportivos.
 *
 * É a fonte única de verdade sobre quais providers a Ryvano suporta, sua
 * disponibilidade e suas capabilities. O core consulta o catálogo (via
 * capabilities/registry) em vez de espalhar condicionais por provider.
 *
 * O fato de um provider existir no catálogo não significa que ele está
 * liberado: a liberação combina `availability === "AVAILABLE"` com uma feature
 * flag por provider (`INTEGRATION_<ID>_ENABLED`), avaliada por
 * `isProviderEnabled`.
 *
 * Este módulo também registra o resolver de capabilities do core, ligando
 * `hasCapability`/`getUserCapabilities` ao lookup em `PROVIDERS[]` sem criar
 * dependência circular (o módulo de capabilities não importa o catálogo).
 *
 * _Requisitos: 1.1, 1.4, 1.5, 1.6, 1.7, 2.5_
 */

import {
  setProviderCapabilitiesResolver,
  type ProviderCapabilities,
} from "@/modules/shared/integrations/capabilities";
import type {
  ProviderAuthType,
  ProviderAvailability,
  ProviderId,
} from "@/modules/shared/integrations/types";

/**
 * Definição de um provider no catálogo. Contém apenas metadados
 * provider-agnostic consumidos pelo core, telas e relatórios.
 */
export interface ProviderDefinition {
  /** Identificador canônico do provider. */
  id: ProviderId;
  /** Nome de exibição. */
  name: string;
  /** Descrição curta para a UI (tela de integrações). */
  description: string;
  /** Estado de disponibilidade (controla se a conexão real é permitida). */
  availability: ProviderAvailability;
  /** Tipo de autenticação (tratado como capability, não método obrigatório). */
  authType: ProviderAuthType;
  /** Capacidades declaradas pelo provider. */
  capabilities: ProviderCapabilities;
}

/**
 * Catálogo inicial de providers.
 *
 * - GARMIN e STRAVA: `AVAILABLE`.
 * - POLAR, COROS, SUUNTO, FITBIT: `COMING_SOON` sem módulo implementado nem
 *   capabilities declaradas.
 */
export const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: "GARMIN",
    name: "Garmin",
    description:
      "Conecte sua conta Garmin para importar atividades e dados fisiológicos (sono, HRV, prontidão e Body Battery).",
    availability: "AVAILABLE",
    authType: "CREDENTIALS",
    // Capabilities alinhadas ao comportamento atual do serviço Garmin.
    capabilities: {
      activities: true,
      activityDetails: true,
      dailyWellness: true,
      recovery: true,
      sleep: true,
      hrv: true,
      readiness: true,
      heartRateZones: true,
      powerZones: true,
      webhooks: false,
    },
  },
  {
    id: "STRAVA",
    name: "Strava",
    description:
      "Conecte sua conta Strava via OAuth para importar suas atividades.",
    availability: "AVAILABLE",
    authType: "OAUTH2",
    // Capabilities CONFIRMADAS na Fase 5 contra a documentação oficial vigente
    // do Strava (fev/2025). O Strava expõe atividades, detalhe de atividade,
    // streams e laps, além de webhooks (Events API) e OAuth 2.0; NÃO fornece
    // dados fisiológicos (sono, HRV, prontidão, recovery).
    // Fontes confirmadas:
    // - OAuth 2.0, scopes activity:read/activity:read_all, authorize/token/
    //   deauthorize: https://developers.strava.com/docs/authentication/
    // - Activity detail, laps, streams (getActivityStreams / getLapsById):
    //   https://developers.strava.com/docs/reference/
    // - Webhooks (Events API): https://developers.strava.com/docs/webhooks/
    // (Conteúdo parafraseado para conformidade com licenciamento.)
    capabilities: {
      activities: true,
      activityDetails: true,
      streams: true,
      laps: true,
      webhooks: true,
      oauth: true,
      // Strava não oferece dados fisiológicos diários.
      recovery: false,
      sleep: false,
      hrv: false,
      readiness: false,
    },
  },
  {
    id: "POLAR",
    name: "Polar",
    description: "Integração com Polar em breve.",
    availability: "COMING_SOON",
    authType: "OAUTH2",
    capabilities: {},
  },
  {
    id: "COROS",
    name: "COROS",
    description: "Integração com COROS em breve.",
    availability: "COMING_SOON",
    authType: "OAUTH2",
    capabilities: {},
  },
  {
    id: "SUUNTO",
    name: "Suunto",
    description: "Integração com Suunto em breve.",
    availability: "COMING_SOON",
    authType: "OAUTH2",
    capabilities: {},
  },
  {
    id: "FITBIT",
    name: "Fitbit",
    description: "Integração com Fitbit em breve.",
    availability: "COMING_SOON",
    authType: "OAUTH2",
    capabilities: {},
  },
];

/** Índice `ProviderId -> ProviderDefinition` para lookup O(1). */
const PROVIDER_INDEX: ReadonlyMap<ProviderId, ProviderDefinition> = new Map(
  PROVIDERS.map((provider) => [provider.id, provider]),
);

/**
 * Retorna a definição de um provider no catálogo, ou `undefined` se ele não
 * existir.
 */
export function getProviderDefinition(
  providerId: ProviderId,
): ProviderDefinition | undefined {
  return PROVIDER_INDEX.get(providerId);
}

/**
 * Lê a feature flag por provider (`INTEGRATION_<ID>_ENABLED`) de forma
 * centralizada — nenhum outro ponto do core deve acessar essa variável.
 *
 * Quando a variável estiver ausente (ou vazia), o provider é considerado
 * habilitado por padrão pelo catálogo; apenas o valor explícito `"false"`
 * desabilita.
 */
function isIntegrationFeatureFlagEnabled(providerId: ProviderId): boolean {
  const raw = process.env[`INTEGRATION_${providerId}_ENABLED`];

  if (raw === undefined || raw.trim() === "") {
    return true;
  }

  return raw.trim().toLowerCase() !== "false";
}

/**
 * Indica se um provider está efetivamente liberado para uso.
 *
 * Combina a disponibilidade do catálogo (`availability === "AVAILABLE"`) com a
 * feature flag por provider. Providers `COMING_SOON`/`DISABLED`/`PRIVATE_BETA`
 * nunca são considerados habilitados, garantindo que nenhum fluxo de conexão
 * real seja iniciado para eles.
 *
 * _Requisitos: 1.6, 1.7_
 */
export function isProviderEnabled(providerId: ProviderId): boolean {
  const definition = getProviderDefinition(providerId);

  if (!definition || definition.availability !== "AVAILABLE") {
    return false;
  }

  return isIntegrationFeatureFlagEnabled(providerId);
}

/**
 * Liga o módulo de capabilities ao catálogo: `hasCapability` e
 * `getUserCapabilities` passam a ler as capabilities declaradas em `PROVIDERS[]`.
 *
 * Feito neste módulo (e não no de capabilities) para evitar dependência
 * circular. O import deste catálogo é o suficiente para efetivar o registro.
 *
 * _Requisitos: 2.5_
 */
setProviderCapabilitiesResolver(
  (providerId) => getProviderDefinition(providerId)?.capabilities,
);
