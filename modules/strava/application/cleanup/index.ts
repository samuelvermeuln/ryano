/**
 * Barrel de cleanup/retenção do Strava (`modules/strava/application/cleanup`).
 *
 * Reúne DOIS grupos de rotinas de purge:
 *
 * 1. Acionadas por EVENTO de webhook (Task 7.3), delegadas pelo processor:
 *   - `purgeDeletedActivityData`: remove a atividade (e o cache) apagada no
 *     Strava (evento `activity/delete`);
 *   - `purgeDeauthorizedUserData`: remove a pegada do Strava de um usuário que
 *     desautorizou o app (evento `athlete` com `authorized="false"`).
 *
 * 2. Acionadas por TTL/retenção (Task 8), agregadas pelo job de retenção:
 *   - `purgeExpiredActivityCache`: cache de atividades expirado;
 *   - `purgeExpiredStreams`: cache de streams expirado (no-op documentado —
 *     a tabela foi adiada na Fase 3);
 *   - `purgeExpiredWebhookPayloads`: eventos de webhook transitórios expirados;
 *   - `runStravaRetentionCleanup`: agregador que roda os três purges de TTL,
 *     isolando falhas entre si (Req 18.2), e retorna as contagens consolidadas.
 *
 * Este barrel NÃO importa o processor de webhook — a dependência é unidirecional
 * (o processor delega a estas funções), evitando ciclos de importação.
 *
 * _Requisitos: 12.4, 17.1, 17.2, 17.3, 17.4, 17.5, 18.2_
 */

export {
  purgeDeletedActivityData,
} from "@/modules/strava/application/cleanup/purge-deleted-activity-data";
export type {
  PurgeDeletedActivityDataInput,
  PurgeDeletedActivityDataResult,
} from "@/modules/strava/application/cleanup/purge-deleted-activity-data";

export {
  purgeDeauthorizedUserData,
} from "@/modules/strava/application/cleanup/purge-deauthorized-user-data";
export type {
  PurgeDeauthorizedUserDataInput,
  PurgeDeauthorizedUserDataResult,
} from "@/modules/strava/application/cleanup/purge-deauthorized-user-data";

export {
  purgeExpiredActivityCache,
} from "@/modules/strava/application/cleanup/purge-expired-activity-cache";
export type {
  PurgeExpiredActivityCacheInput,
  PurgeExpiredActivityCacheResult,
} from "@/modules/strava/application/cleanup/purge-expired-activity-cache";

export {
  purgeExpiredStreams,
} from "@/modules/strava/application/cleanup/purge-expired-streams";
export type {
  PurgeExpiredStreamsInput,
  PurgeExpiredStreamsResult,
} from "@/modules/strava/application/cleanup/purge-expired-streams";

export {
  purgeExpiredWebhookPayloads,
} from "@/modules/strava/application/cleanup/purge-expired-webhook-payloads";
export type {
  PurgeExpiredWebhookPayloadsInput,
  PurgeExpiredWebhookPayloadsResult,
} from "@/modules/strava/application/cleanup/purge-expired-webhook-payloads";

export {
  runStravaRetentionCleanup,
} from "@/modules/strava/application/cleanup/run-strava-retention-cleanup";
export type {
  RunStravaRetentionCleanupInput,
  RunStravaRetentionCleanupResult,
} from "@/modules/strava/application/cleanup/run-strava-retention-cleanup";
