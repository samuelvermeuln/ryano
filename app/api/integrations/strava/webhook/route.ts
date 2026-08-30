import {
  handleStravaWebhookGet,
  handleStravaWebhookPost,
} from "@/modules/strava";

/**
 * Rota do webhook do Strava (adapter fino — Task 7, Req 12.1).
 *
 * Toda a lógica vive no módulo (`modules/strava/webhooks`); aqui só delegamos:
 *   - GET: validação da subscription (challenge) — responde 200 com
 *     `{ "hub.challenge": <valor> }` quando o `hub.verify_token` bate com
 *     `STRAVA_WEBHOOK_VERIFY_TOKEN`; 403 caso contrário.
 *   - POST: recebe o evento, valida o shape, persiste `StravaWebhookEvent`
 *     (PENDING, dedupe-aware) e responde 200 rápido; o processamento pesado é
 *     assíncrono (job `processPendingStravaWebhookEvents`).
 *
 * Segurança (Req 20.5): rota pública SEM autenticação por sessão — é assim que o
 * serviço do Strava precisa alcançá-la. A proteção do GET é o `verify_token`
 * (handshake da subscription); o Strava não assina os POSTs de evento, então
 * eles são tratados defensivamente (validação de shape + dedupe + resolução por
 * `owner_id`, descartando atletas desconhecidos no processor). Nenhum
 * token/segredo/PII é logado.
 *
 * `force-dynamic`: a rota depende do request (query/body) e nunca deve ser
 * cacheada/prerenderizada.
 */
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return handleStravaWebhookGet(request);
}

export function POST(request: Request): Promise<Response> {
  return handleStravaWebhookPost(request);
}
