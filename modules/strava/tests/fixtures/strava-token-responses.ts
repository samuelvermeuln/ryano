/**
 * Fixtures SANITIZADAS de respostas de token OAuth do Strava (Req 21.3).
 *
 * Nenhum dado real: tokens, athleteId, usernames e nomes são placeholders
 * inventados. Não contêm PII (email/telefone/GPS) nem segredos reais. Ficam sob
 * `modules/strava/tests/fixtures/` conforme exigido pelo Requisito 21.3.
 *
 * A forma dos objetos espelha o corpo documentado da resposta de token do Strava
 * (token_type/access_token/refresh_token/expires_at/expires_in + athlete na
 * troca inicial). Ver `modules/strava/api/schemas/strava-token-response.ts`.
 */

/** Id de atleta sanitizado (inventado). O Strava usa um id numérico. */
export const SANITIZED_STRAVA_ATHLETE_ID = 1234567;

/**
 * `expires_at` fixo e bem no futuro (epoch em segundos ~ ano 2030) para manter
 * os testes determinísticos sem depender do relógio real.
 */
export const FIXTURE_FUTURE_EXPIRES_AT = 1_900_000_000;

/** Tokens sanitizados usados nas fixtures. */
export const SANITIZED_TOKENS = {
  initialAccess: "test-access-token-initial",
  initialRefresh: "test-refresh-token-initial",
  refreshedAccess: "test-access-token-refreshed",
  rotatedRefresh: "test-refresh-token-rotated",
} as const;

type TokenResponseOverrides = Record<string, unknown>;

/**
 * Resposta da troca inicial (`grant_type=authorization_code`): inclui `athlete`
 * com `id`, conforme a documentação (o atleta só vem na troca inicial).
 */
export function buildInitialExchangeResponse(
  overrides: TokenResponseOverrides = {},
) {
  return {
    token_type: "Bearer",
    expires_at: FIXTURE_FUTURE_EXPIRES_AT,
    expires_in: 21_600,
    refresh_token: SANITIZED_TOKENS.initialRefresh,
    access_token: SANITIZED_TOKENS.initialAccess,
    athlete: {
      id: SANITIZED_STRAVA_ATHLETE_ID,
      username: "sanitized-athlete",
      firstname: "Sanitized",
      lastname: "Athlete",
    },
    ...overrides,
  };
}

/**
 * Resposta de refresh COM rotação: devolve um `refresh_token` DIFERENTE do
 * enviado, exercitando a persistência da rotação (Req 10.5). Sem `athlete`
 * (o refresh não retorna atleta).
 */
export function buildRotatedRefreshResponse(overrides: TokenResponseOverrides = {}) {
  return {
    token_type: "Bearer",
    expires_at: FIXTURE_FUTURE_EXPIRES_AT,
    expires_in: 21_600,
    refresh_token: SANITIZED_TOKENS.rotatedRefresh,
    access_token: SANITIZED_TOKENS.refreshedAccess,
    ...overrides,
  };
}

/**
 * Resposta de refresh SEM rotação: devolve o MESMO `refresh_token` enviado
 * (cenário em que o access token ainda tinha >1h e o Strava reemite o mesmo par).
 */
export function buildNonRotatedRefreshResponse(
  overrides: TokenResponseOverrides = {},
) {
  return {
    token_type: "Bearer",
    expires_at: FIXTURE_FUTURE_EXPIRES_AT,
    expires_in: 21_600,
    refresh_token: SANITIZED_TOKENS.initialRefresh,
    access_token: SANITIZED_TOKENS.refreshedAccess,
    ...overrides,
  };
}
