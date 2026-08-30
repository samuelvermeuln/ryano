/**
 * Módulo Strava para o `providerRegistry` do core.
 *
 * A partir da Task 6.4, expõe a capability `activity` (ActivityProvider), ligada
 * ao `StravaClient` + parsers. Com isso, `getUserActivitySources` passa a incluir
 * STRAVA para conexões conectadas. As demais capabilities são ligadas depois,
 * sem alterar o core:
 *
 * - `activity` (ActivityProvider): LIGADA (Task 6.4) — listagem/normalização via
 *   `createStravaActivityProvider`.
 * - `webhook` (WebhookProvider): LIGADA (Task 7) — `verifyChallenge` +
 *   `handleEvent` (ingestão dedupe-aware) via `createStravaWebhookProvider`. O
 *   processamento pesado é do job `processPendingStravaWebhookEvents` (Task 8.1).
 * - `recovery` (RecoveryProvider): não se aplica ao Strava (sem dados
 *   fisiológicos), permanece ausente.
 *
 * A ausência de uma capability continua sendo tratada pelo core como
 * "capability indisponível" e não quebra.
 *
 * _Requisitos: 4.1, 4.3_
 */

import type { ProviderModule } from "@/modules/shared/integrations/contracts";
import { createStravaActivityProvider } from "@/modules/strava/infrastructure/provider/strava-activity-provider";
import { createStravaWebhookProvider } from "@/modules/strava/webhooks/strava-webhook-provider";

/**
 * Módulo Strava registrado no `providerRegistry`.
 *
 * `activity` ligado na Task 6.4; `webhook` ligado na Task 7.
 */
export const stravaModule: ProviderModule = {
  id: "STRAVA",
  activity: createStravaActivityProvider(),
  webhook: createStravaWebhookProvider(),
};

export { createStravaActivityProvider } from "@/modules/strava/infrastructure/provider/strava-activity-provider";
