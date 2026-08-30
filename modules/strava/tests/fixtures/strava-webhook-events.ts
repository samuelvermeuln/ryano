/**
 * Fixtures SANITIZADAS de eventos de webhook do Strava (Req 21.3) para os testes
 * de webhook (Task 7.4).
 *
 * Nenhum dado real: ids de atleta/atividade e subscription são placeholders
 * inventados; sem PII e sem segredos. As formas espelham o "wire shape"
 * documentado do Event Data do webhook
 * (`modules/strava/api/schemas/strava-webhook-event.ts`).
 *
 * Ficam sob `modules/strava/tests/fixtures/` conforme exigido pelo Req 21.3.
 */

import { SANITIZED_ATHLETE_ID, SANITIZED_ACTIVITY_IDS } from "@/modules/strava/tests/fixtures/strava-activities";

/** Id de subscription sanitizado (inventado). */
export const SANITIZED_SUBSCRIPTION_ID = 555_001;

/** `event_time` fixo (epoch em segundos) — determinístico. */
export const FIXTURE_EVENT_TIME_SECONDS = Math.floor(
  Date.UTC(2024, 5, 1, 7, 5, 0) / 1000,
);

type Overrides = Record<string, unknown>;

/**
 * Evento de atividade `create` (o caso mais comum). O corpo NÃO traz os dados da
 * atividade — só a identidade — conforme a doc oficial do Strava.
 */
export function buildActivityCreateEvent(overrides: Overrides = {}) {
  return {
    object_type: "activity",
    object_id: SANITIZED_ACTIVITY_IDS.ride,
    aspect_type: "create",
    updates: {},
    owner_id: SANITIZED_ATHLETE_ID,
    subscription_id: SANITIZED_SUBSCRIPTION_ID,
    event_time: FIXTURE_EVENT_TIME_SECONDS,
    ...overrides,
  };
}

/** Evento de atividade `update` (ex.: título/tipo/privacidade alterados). */
export function buildActivityUpdateEvent(overrides: Overrides = {}) {
  return buildActivityCreateEvent({
    aspect_type: "update",
    updates: { title: "Sanitized new title" },
    ...overrides,
  });
}

/** Evento de atividade `delete` (o atleta apagou a atividade no Strava). */
export function buildActivityDeleteEvent(overrides: Overrides = {}) {
  return buildActivityCreateEvent({
    aspect_type: "delete",
    updates: {},
    ...overrides,
  });
}

/**
 * Evento de desautorização do app: `object_type=athlete` + `aspect_type=update`
 * com `updates.authorized="false"` (string), conforme a doc oficial.
 */
export function buildDeauthorizationEvent(overrides: Overrides = {}) {
  return {
    object_type: "athlete",
    object_id: SANITIZED_ATHLETE_ID,
    aspect_type: "update",
    updates: { authorized: "false" },
    owner_id: SANITIZED_ATHLETE_ID,
    subscription_id: SANITIZED_SUBSCRIPTION_ID,
    event_time: FIXTURE_EVENT_TIME_SECONDS,
    ...overrides,
  };
}
