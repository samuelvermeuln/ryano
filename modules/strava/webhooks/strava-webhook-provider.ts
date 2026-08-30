/**
 * Adapter `WebhookProvider` do Strava para o `providerRegistry` do core
 * (Task 7 — wiring opcional).
 *
 * Liga a capability de webhook do Strava ao contrato genérico `WebhookProvider`
 * do core, composto por:
 *   - `verifyChallenge(query)`: valida o challenge GET (delegando a
 *     `verifyStravaWebhookChallenge`) e devolve `{ ok, challenge? }`.
 *   - `handleEvent(payload)`: ingere o evento (persiste `PENDING`, dedupe-aware)
 *     para processamento assíncrono. O trabalho pesado (buscar/normalizar/
 *     upsertar a atividade) é do `processPendingStravaWebhookEvents` (job da
 *     Task 8.1) — manter o `handleEvent` barato preserva a exigência de resposta
 *     rápida do Strava (~2s).
 *
 * A ausência desta capability nunca quebrou o core; agora, presente, ela apenas
 * expõe validação + ingestão via registry — a rota HTTP fina continua sendo o
 * ponto de entrada real (adapter).
 *
 * _Requisitos: 4.1, 4.3, 4.4, 12.1, 12.2, 12.3_
 */

import type { ProviderCapabilities } from "@/modules/shared/integrations/capabilities";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { WebhookProvider } from "@/modules/shared/integrations/contracts";
import type { ProviderAuthType } from "@/modules/shared/integrations/types";
import { ingestStravaWebhookEvent } from "@/modules/strava/webhooks/handler";
import { verifyStravaWebhookChallenge } from "@/modules/strava/webhooks/validation";

/** Capabilities/authType declarados no catálogo (fallback defensivo). */
function stravaBaseMeta(): {
  capabilities: ProviderCapabilities;
  authType: ProviderAuthType;
} {
  const definition = getProviderDefinition("STRAVA");
  return {
    capabilities: (definition?.capabilities ?? { webhooks: true }) as ProviderCapabilities,
    authType: definition?.authType ?? "OAUTH2",
  };
}

/** Constrói o `WebhookProvider` do Strava para o registry. */
export function createStravaWebhookProvider(): WebhookProvider {
  const { capabilities, authType } = stravaBaseMeta();

  return {
    id: "STRAVA",
    capabilities,
    authType,

    verifyChallenge(query: Record<string, string>): {
      ok: boolean;
      challenge?: string;
    } {
      const result = verifyStravaWebhookChallenge(query);
      return result.ok ? { ok: true, challenge: result.challenge } : { ok: false };
    },

    async handleEvent(payload: unknown): Promise<void> {
      await ingestStravaWebhookEvent(payload);
    },
  };
}
