/**
 * Configuração e validação de ambiente do módulo Strava.
 *
 * Ponto ÚNICO de acesso às variáveis `STRAVA_*`: nenhum outro arquivo do módulo
 * (ou do core) deve ler `process.env.STRAVA_*` diretamente. O acesso é
 * centralizado aqui e validado com Zod, espelhando o padrão de `server/env.ts`
 * (preprocess que converte string vazia em `undefined`).
 *
 * Os valores default de URLs de OAuth/API foram confirmados na documentação
 * oficial vigente do Strava antes de serem fixados:
 *
 * - Authorize (web): `https://www.strava.com/oauth/authorize`
 * - Token exchange/refresh: `https://www.strava.com/oauth/token`
 * - Deauthorize (revoke atual em produção): `https://www.strava.com/oauth/deauthorize`
 * - API base v3: `https://www.strava.com/api/v3`
 *
 * Fonte: [Strava Authentication](https://developers.strava.com/docs/authentication/).
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * Observação sobre `STRAVA_OAUTH_REVOKE_URL`: o Strava anunciou um novo endpoint
 * `POST https://www.strava.com/oauth/revoke` (recomendado a partir de 2026 e
 * único suportado a partir de 2027). O default aqui aponta para o endpoint de
 * deauthorização atualmente em produção; quando a migração for necessária, basta
 * sobrescrever a variável de ambiente — nenhum código muda.
 *
 * Feature flags de provider (`INTEGRATION_STRAVA_ENABLED` etc.): NÃO são lidas
 * aqui. Elas já são tratadas de forma centralizada pelo catálogo
 * (`modules/shared/integrations/catalog` via `isProviderEnabled`). Documentado
 * aqui apenas para deixar claro onde vivem.
 *
 * _Requisitos: 19.1, 19.2, 19.3, 10.7_
 */

import { z } from "zod";

function emptyToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

/** URL opcional (vazio → `undefined`). */
const optionalUrl = () => z.preprocess(emptyToUndefined, z.string().url().optional());
/** String opcional não-vazia (vazio → `undefined`). */
const optionalString = () => z.preprocess(emptyToUndefined, z.string().min(1).optional());
/** URL com default aplicado quando ausente/vazia. */
const urlWithDefault = (defaultValue: string) =>
  z.preprocess(emptyToUndefined, z.string().url().default(defaultValue));

/** Default de dias de backfill inicial ao conectar (Req 11.6). */
export const DEFAULT_STRAVA_INITIAL_BACKFILL_DAYS = 30;

/**
 * Defaults de rate limit do Strava, confirmados na documentação oficial vigente
 * ([Strava Rate Limits](https://developers.strava.com/docs/rate-limits/),
 * parafraseado para conformidade de licenciamento):
 *
 * - Limite "overall" (todas as chamadas): 200 requisições / 15 min e
 *   2.000 / dia (default de apps novos).
 * - Limite "read" / "non-upload" (tudo exceto criação de atividade/upload de
 *   mídia): 100 requisições / 15 min e 1.000 / dia.
 *
 * A janela de 15 min reinicia em múltiplos naturais do relógio (min 0/15/30/45);
 * a diária reinicia à meia-noite UTC. Como o módulo Strava opera somente em
 * leitura (sem uploads), o limite "read" (100/15min, 1.000/dia) é o efetivamente
 * restritivo — daí ele ser o default pedido pela tarefa. Todos os quatro valores
 * são sobrescrevíveis por ENV para acomodar apps com limite elevado.
 */
export const DEFAULT_STRAVA_RATE_LIMIT_OVERALL_SHORT_TERM = 200;
export const DEFAULT_STRAVA_RATE_LIMIT_OVERALL_DAILY = 2000;
export const DEFAULT_STRAVA_RATE_LIMIT_READ_SHORT_TERM = 100;
export const DEFAULT_STRAVA_RATE_LIMIT_READ_DAILY = 1000;

/** Default da URL de autorização OAuth (web). */
export const DEFAULT_STRAVA_OAUTH_AUTHORIZE_URL =
  "https://www.strava.com/oauth/authorize";
/** Default da URL de troca/refresh de token. */
export const DEFAULT_STRAVA_OAUTH_TOKEN_URL = "https://www.strava.com/oauth/token";
/** Default da URL de deauthorização (revoke atual em produção). */
export const DEFAULT_STRAVA_OAUTH_REVOKE_URL =
  "https://www.strava.com/oauth/deauthorize";
/** Default da base da API v3. */
export const DEFAULT_STRAVA_API_BASE_URL = "https://www.strava.com/api/v3";

const stravaEnvSchema = z.object({
  // Credenciais da aplicação (obtidas no registro do app Strava).
  STRAVA_CLIENT_ID: optionalString(),
  STRAVA_CLIENT_SECRET: optionalString(),

  // URLs de API/OAuth com defaults oficiais.
  STRAVA_API_BASE_URL: urlWithDefault(DEFAULT_STRAVA_API_BASE_URL),
  STRAVA_OAUTH_AUTHORIZE_URL: urlWithDefault(DEFAULT_STRAVA_OAUTH_AUTHORIZE_URL),
  STRAVA_OAUTH_TOKEN_URL: urlWithDefault(DEFAULT_STRAVA_OAUTH_TOKEN_URL),
  STRAVA_OAUTH_REVOKE_URL: urlWithDefault(DEFAULT_STRAVA_OAUTH_REVOKE_URL),

  // Callbacks específicos da aplicação (sem default — dependem do deploy).
  STRAVA_OAUTH_CALLBACK_URL: optionalUrl(),
  STRAVA_WEBHOOK_CALLBACK_URL: optionalUrl(),

  // Verify token usado na criação/validação do challenge do webhook.
  STRAVA_WEBHOOK_VERIFY_TOKEN: optionalString(),

  // Backfill inicial (dias) — decisão do módulo Strava.
  STRAVA_INITIAL_BACKFILL_DAYS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(DEFAULT_STRAVA_INITIAL_BACKFILL_DAYS),
  ),

  // Overrides opcionais dos limites de rate limit (números positivos). Quando
  // ausentes, usamos os defaults oficiais acima. Úteis para apps com acesso
  // elevado (ex.: 400/4000 overall, 200/2000 read).
  STRAVA_RATE_LIMIT_OVERALL_SHORT_TERM: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_STRAVA_RATE_LIMIT_OVERALL_SHORT_TERM),
  ),
  STRAVA_RATE_LIMIT_OVERALL_DAILY: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(DEFAULT_STRAVA_RATE_LIMIT_OVERALL_DAILY),
  ),
  STRAVA_RATE_LIMIT_READ_SHORT_TERM: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_STRAVA_RATE_LIMIT_READ_SHORT_TERM),
  ),
  STRAVA_RATE_LIMIT_READ_DAILY: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(DEFAULT_STRAVA_RATE_LIMIT_READ_DAILY),
  ),

  // Trava de combinação/reconciliação entre providers (default: desabilitada).
  // Mantida como string ("true"/"false") para preservar a mesma semântica lida
  // diretamente pela policy gate (ver nota em getStravaConfig()).
  STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED: z.preprocess(
    emptyToUndefined,
    z.enum(["true", "false"]).default("false"),
  ),
});

/** Formato tipado da configuração validada do módulo Strava. */
export type StravaEnv = z.infer<typeof stravaEnvSchema>;

const parsedStravaEnv = stravaEnvSchema.parse({
  STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET,
  STRAVA_API_BASE_URL: process.env.STRAVA_API_BASE_URL,
  STRAVA_OAUTH_AUTHORIZE_URL: process.env.STRAVA_OAUTH_AUTHORIZE_URL,
  STRAVA_OAUTH_TOKEN_URL: process.env.STRAVA_OAUTH_TOKEN_URL,
  STRAVA_OAUTH_REVOKE_URL: process.env.STRAVA_OAUTH_REVOKE_URL,
  STRAVA_OAUTH_CALLBACK_URL: process.env.STRAVA_OAUTH_CALLBACK_URL,
  STRAVA_WEBHOOK_CALLBACK_URL: process.env.STRAVA_WEBHOOK_CALLBACK_URL,
  STRAVA_WEBHOOK_VERIFY_TOKEN: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN,
  STRAVA_INITIAL_BACKFILL_DAYS: process.env.STRAVA_INITIAL_BACKFILL_DAYS,
  STRAVA_RATE_LIMIT_OVERALL_SHORT_TERM:
    process.env.STRAVA_RATE_LIMIT_OVERALL_SHORT_TERM,
  STRAVA_RATE_LIMIT_OVERALL_DAILY: process.env.STRAVA_RATE_LIMIT_OVERALL_DAILY,
  STRAVA_RATE_LIMIT_READ_SHORT_TERM: process.env.STRAVA_RATE_LIMIT_READ_SHORT_TERM,
  STRAVA_RATE_LIMIT_READ_DAILY: process.env.STRAVA_RATE_LIMIT_READ_DAILY,
  STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED:
    process.env.STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED,
});

/** Configuração validada do módulo Strava (imutável). */
export const stravaEnv: StravaEnv = parsedStravaEnv;

/**
 * Forma tipada e agrupada da configuração do Strava, consumida pelas camadas do
 * módulo (auth, api, webhooks, sync, cleanup). Booleans/números já convertidos.
 */
export interface StravaConfig {
  clientId?: string;
  clientSecret?: string;
  apiBaseUrl: string;
  oauth: {
    authorizeUrl: string;
    tokenUrl: string;
    revokeUrl: string;
    callbackUrl?: string;
  };
  webhook: {
    callbackUrl?: string;
    verifyToken?: string;
  };
  initialBackfillDays: number;
  /**
   * Limites de rate limit por janela (15 min e diária), para os buckets
   * "overall" e "read"/"non-upload", conforme a doc oficial do Strava.
   */
  rateLimits: {
    overall: { shortTermLimit: number; dailyLimit: number };
    read: { shortTermLimit: number; dailyLimit: number };
  };
  crossProviderReconciliationEnabled: boolean;
}

/**
 * Retorna a configuração agrupada e tipada do módulo Strava.
 *
 * Nota sobre `crossProviderReconciliationEnabled`: a policy gate
 * (`modules/shared/integrations/policy`) continua lendo
 * `STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED` diretamente (tarefa 1.6) — este
 * getter apenas oferece acesso tipado equivalente com a mesma semântica default
 * (`false`; somente `"true"` habilita). As duas leituras são consistentes.
 */
export function getStravaConfig(): StravaConfig {
  return {
    clientId: stravaEnv.STRAVA_CLIENT_ID,
    clientSecret: stravaEnv.STRAVA_CLIENT_SECRET,
    apiBaseUrl: stravaEnv.STRAVA_API_BASE_URL,
    oauth: {
      authorizeUrl: stravaEnv.STRAVA_OAUTH_AUTHORIZE_URL,
      tokenUrl: stravaEnv.STRAVA_OAUTH_TOKEN_URL,
      revokeUrl: stravaEnv.STRAVA_OAUTH_REVOKE_URL,
      callbackUrl: stravaEnv.STRAVA_OAUTH_CALLBACK_URL,
    },
    webhook: {
      callbackUrl: stravaEnv.STRAVA_WEBHOOK_CALLBACK_URL,
      verifyToken: stravaEnv.STRAVA_WEBHOOK_VERIFY_TOKEN,
    },
    initialBackfillDays: stravaEnv.STRAVA_INITIAL_BACKFILL_DAYS,
    rateLimits: {
      overall: {
        shortTermLimit: stravaEnv.STRAVA_RATE_LIMIT_OVERALL_SHORT_TERM,
        dailyLimit: stravaEnv.STRAVA_RATE_LIMIT_OVERALL_DAILY,
      },
      read: {
        shortTermLimit: stravaEnv.STRAVA_RATE_LIMIT_READ_SHORT_TERM,
        dailyLimit: stravaEnv.STRAVA_RATE_LIMIT_READ_DAILY,
      },
    },
    crossProviderReconciliationEnabled:
      stravaEnv.STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED === "true",
  };
}

/**
 * Indica se as credenciais mínimas de OAuth do Strava estão configuradas
 * (client id + secret). Útil para as rotas decidirem se o fluxo de conexão pode
 * iniciar sem expor os valores.
 */
export function hasStravaOAuthEnv(): boolean {
  return Boolean(stravaEnv.STRAVA_CLIENT_ID && stravaEnv.STRAVA_CLIENT_SECRET);
}

/**
 * Retorna o número de dias de backfill inicial ao conectar (Req 11.6).
 */
export function getStravaInitialBackfillDays(): number {
  return stravaEnv.STRAVA_INITIAL_BACKFILL_DAYS;
}

/**
 * Retorna os limites de rate limit do Strava (overall + read), já resolvidos
 * a partir dos defaults oficiais e dos overrides de ENV. Consumido pelo limiter
 * em `modules/strava/infrastructure/rate-limit`.
 */
export function getStravaRateLimits(): StravaConfig["rateLimits"] {
  return {
    overall: {
      shortTermLimit: stravaEnv.STRAVA_RATE_LIMIT_OVERALL_SHORT_TERM,
      dailyLimit: stravaEnv.STRAVA_RATE_LIMIT_OVERALL_DAILY,
    },
    read: {
      shortTermLimit: stravaEnv.STRAVA_RATE_LIMIT_READ_SHORT_TERM,
      dailyLimit: stravaEnv.STRAVA_RATE_LIMIT_READ_DAILY,
    },
  };
}

/**
 * Espelha a semântica da policy gate para a trava de combinação entre providers
 * (default `false`; somente `"true"` habilita).
 */
export function isStravaCrossProviderReconciliationEnabled(): boolean {
  return stravaEnv.STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED === "true";
}
