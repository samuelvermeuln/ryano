/**
 * Parser consolidado da resposta de token do Strava (OAuth 2.0).
 *
 * ### Por que este arquivo existe (consolidação sem quebra)
 *
 * O schema Zod da resposta de token (`stravaTokenResponseSchema`) foi definido
 * na Task 5.3 e vive em `@/modules/strava/api/schemas/strava-token-response`.
 * As camadas de auth já em produção — `auth/token-exchange.ts` (5.3) e
 * `auth/token-refresh.ts` (5.4) — importam esse schema **daquele caminho**.
 *
 * Para consolidar a "leitura de token" na camada de parsers (Task 6.2) SEM
 * quebrar esses consumidores, este módulo NÃO move o schema: ele o **reexporta**
 * (mantendo `api/schemas` como fonte de verdade da validação runtime) e agrega
 * um helper fino `parseStravaTokenResponse(json)` que valida + extrai os campos
 * úteis num formato de domínio (`ParsedStravaTokenResponse`), pronto para
 * persistência, sem que o DTO remoto vaze para o domínio/UI (Req 11.4).
 *
 * Assim: os imports existentes de `api/schemas` continuam válidos; novos
 * consumidores podem depender deste parser como superfície única de token.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Extração (confirmada na doc oficial vigente do Strava —
 * [Strava Authentication](https://developers.strava.com/docs/authentication/)):
 *   - `access_token` / `refresh_token` — tokens (o refresh pode ser rotacionado).
 *   - `expires_at` — expiração do access token em epoch (segundos, UTC) →
 *     convertido para `Date`.
 *   - `athlete.id` — id numérico do atleta; presente apenas na troca inicial
 *     (`authorization_code`), ausente no refresh → `athleteId?`.
 *   - Os scopes concedidos NÃO vêm no corpo do token: retornam como query
 *     `scope` no callback. Por isso `scopes` é derivado de um `scope` opcional
 *     passado pelo chamador (fallback para o `scope` do corpo, raro).
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * _Requisitos: 11.4, 7.1, 10.3, 10.4_
 */

import {
  stravaTokenAthleteSchema,
  stravaTokenResponseSchema,
  type StravaTokenResponse,
} from "@/modules/strava/api/schemas/strava-token-response";

// Reexporta a superfície de schema/validação a partir da camada de parsers,
// mantendo `api/schemas` como fonte de verdade (não move, apenas consolida).
export {
  stravaTokenAthleteSchema,
  stravaTokenResponseSchema,
  type StravaTokenResponse,
};

/**
 * Resultado do parse da resposta de token, em forma de domínio (sem shape wire).
 */
export interface ParsedStravaTokenResponse {
  /** Access token (texto puro — cifrar antes de persistir; nunca logar). */
  accessToken: string;
  /** Refresh token vigente (rotacionado quando o Strava devolve um novo). */
  refreshToken: string;
  /** Expiração do access token derivada de `expires_at`, ou `null`. */
  expiresAt: Date | null;
  /** Segundos restantes até expirar (`expires_in`), quando informado. */
  expiresInSeconds?: number;
  /** Tipo do token (normalmente `"Bearer"`), quando informado. */
  tokenType?: string;
  /**
   * Id do atleta como string, quando presente (troca inicial). Ausente no
   * refresh. O Strava usa id numérico; convertemos para string para casar com o
   * schema Prisma.
   */
  athleteId?: string;
  /**
   * Scopes de fato concedidos, normalizados e sem duplicatas. Derivados do
   * `scope` do callback (autoritativo) com fallback para o `scope` do corpo.
   */
  scopes: string[];
}

/** Opções de `parseStravaTokenResponse`. */
export interface ParseStravaTokenResponseOptions {
  /**
   * String bruta de `scope` do callback (lista separada por vírgula/espaço),
   * fonte autoritativa dos scopes concedidos (Req 10.4). Quando ausente, cai
   * para o `scope` do corpo do token (raro) e, por fim, lista vazia.
   */
  scope?: string | null;
}

/**
 * Erro de parse da resposta de token do Strava. Carrega um `code` estável para
 * observabilidade, sem vazar segredos.
 */
export class StravaTokenResponseParseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StravaTokenResponseParseError";
    this.code = code;
  }
}

/**
 * Normaliza a string de scopes em uma lista limpa e sem duplicatas (aceita
 * vírgula ou espaço como separador; preserva a ordem de primeira ocorrência).
 *
 * Reimplementado localmente (em vez de importar de `auth/token-exchange.ts`)
 * para manter esta camada de parsers pura, sem arrastar dependências de
 * servidor (prisma/crypto) para quem só precisa parsear um token.
 */
export function normalizeStravaScopes(rawScope: string | null | undefined): string[] {
  if (!rawScope || typeof rawScope !== "string") {
    return [];
  }

  const seen = new Set<string>();
  const scopes: string[] = [];

  for (const part of rawScope.split(/[\s,]+/)) {
    const scope = part.trim();
    if (scope !== "" && !seen.has(scope)) {
      seen.add(scope);
      scopes.push(scope);
    }
  }

  return scopes;
}

/** Converte `expires_at` (epoch em segundos) em `Date`, tolerando ausência. */
function expiresAtToDate(expiresAt: number | undefined): Date | null {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }

  return new Date(expiresAt * 1000);
}

/**
 * Valida (Zod) e extrai a resposta de token do Strava para a forma de domínio
 * `ParsedStravaTokenResponse`.
 *
 * Não persiste nada e não faz rede — é uma função pura de parsing. O `athleteId`
 * fica `undefined` quando ausente (caso do refresh); cabe ao chamador exigir sua
 * presença na troca inicial, se necessário.
 *
 * @throws {StravaTokenResponseParseError} quando o payload não passa na
 *   validação de schema.
 */
export function parseStravaTokenResponse(
  json: unknown,
  options: ParseStravaTokenResponseOptions = {},
): ParsedStravaTokenResponse {
  const parsed = stravaTokenResponseSchema.safeParse(json);

  if (!parsed.success) {
    throw new StravaTokenResponseParseError(
      "STRAVA_TOKEN_RESPONSE_INVALID",
      "Resposta de token do Strava não passou na validação de schema.",
    );
  }

  const data: StravaTokenResponse = parsed.data;
  const athleteId =
    data.athlete?.id !== undefined && data.athlete?.id !== null
      ? String(data.athlete.id)
      : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: expiresAtToDate(data.expires_at),
    expiresInSeconds: data.expires_in,
    tokenType: data.token_type,
    athleteId,
    scopes: normalizeStravaScopes(options.scope ?? data.scope ?? null),
  };
}
