/**
 * Schema Zod da resposta de token do Strava (OAuth 2.0).
 *
 * Usado na troca de código por token (`auth/token-exchange.ts`, Task 5.3) e
 * reutilizável no refresh (Task 5.4). Um parser dedicado
 * (`parsers/parse-strava-token-response.ts`) está previsto para a Task 6.2, que
 * deve CONSOLIDAR/mover este schema para a camada de parsers; por ora ele vive
 * aqui, na camada `api/schemas` (validação runtime de DTO remoto), conforme o
 * design (o DTO remoto nunca vai direto ao domínio/UI).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Forma da resposta confirmada na documentação oficial vigente do Strava
 * ([Strava Authentication](https://developers.strava.com/docs/authentication/)):
 *
 * A troca de `code` por token é um `POST` para o token URL com `client_id`,
 * `client_secret`, `code` e `grant_type=authorization_code`. O corpo de resposta
 * contém:
 *   - `token_type`: sempre `"Bearer"`.
 *   - `access_token`: token de acesso (curta duração, ~6h).
 *   - `refresh_token`: token usado para renovar o acesso.
 *   - `expires_at`: expiração do access token em epoch (segundos, UTC).
 *   - `expires_in`: segundos restantes até expirar.
 *   - `athlete`: representação-resumo do atleta (inclui `id` numérico) — presente
 *     apenas na troca inicial (authorization_code); ausente no refresh.
 *
 * IMPORTANTE sobre scopes: o corpo do token NÃO traz os scopes concedidos. Os
 * scopes de fato autorizados retornam como parâmetro de query `scope` no
 * callback (lista separada por vírgula). Por isso o schema trata `scope` como
 * opcional aqui e a extração dos scopes concedidos (Req 10.4) é feita a partir
 * do callback pela função de troca.
 *
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * _Requisitos: 10.3, 10.4, 11.2, 11.3_
 */

import { z } from "zod";

/**
 * Representação-resumo do atleta retornada na troca inicial. Apenas `id` é
 * exigido; demais campos são preservados sem validação estrita (`passthrough`)
 * porque não são consumidos aqui.
 */
export const stravaTokenAthleteSchema = z
  .object({
    // Strava usa um id numérico (long). Aceitamos number e convertemos para
    // string na camada de aplicação para casar com o schema Prisma.
    id: z.number().int(),
  })
  .passthrough();

/**
 * Schema da resposta de token do Strava (troca inicial e refresh).
 *
 * `athlete` é opcional para permitir reutilização no refresh (onde não vem);
 * a função de troca (`exchangeStravaCode`) valida a presença de `athlete.id`
 * explicitamente, pois na troca inicial ele é obrigatório.
 */
export const stravaTokenResponseSchema = z
  .object({
    token_type: z.string().optional(),
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    // Epoch em segundos (UTC). Positivo.
    expires_at: z.number().int().positive(),
    expires_in: z.number().int().optional(),
    athlete: stravaTokenAthleteSchema.optional(),
    // Normalmente ausente no corpo; scopes concedidos vêm do callback.
    scope: z.string().optional(),
  })
  .passthrough();

/** Tipo inferido da resposta de token validada do Strava. */
export type StravaTokenResponse = z.infer<typeof stravaTokenResponseSchema>;
