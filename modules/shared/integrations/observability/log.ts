/**
 * Helper de LOGGING estruturado para operações de integração (Task 9.3 /
 * Req 20.1, 20.2, 20.3).
 *
 * Padroniza os campos que TODA operação de integração deve logar
 * (`provider`, `operation`, `status`, e opcionalmente `connectionId`/
 * `httpStatus`) e envolve o `logger` estruturado existente
 * (`@/server/logging/logger`), que já faz redação profunda de chaves sensíveis.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Rede de segurança contra vazamento (Req 20.1/20.2):
 *
 * Este helper OMITE, de forma defensiva e recursiva, chaves reconhecidamente
 * sensíveis (tokens, secrets, senha, ciphertext, authTag, `code` de OAuth,
 * `client_secret`, `verify_token`, telefone, e-mail, ...) ANTES de entregar o
 * meta ao logger. É uma barreira EXTRA (o logger já redige muitas dessas), de
 * modo que nenhum segredo/PII vaze mesmo que um call site passe um campo
 * sensível por engano. Os campos padronizados (provider/operation/status/
 * connectionId/httpStatus) nunca são sensíveis e sempre passam.
 *
 * _Requisitos: 20.1, 20.2, 20.3_
 */

import { logger } from "@/server/logging/logger";
import type { ProviderId } from "@/modules/shared/integrations/types";

/** Nível de log suportado (espelha a API do `logger`). */
export type IntegrationLogLevel = "info" | "warn" | "error";

/**
 * Campos padronizados de um evento de integração. `provider`/`operation`/
 * `status` são obrigatórios e tipados para consistência (Req 20.3); qualquer
 * metadado adicional seguro pode ser incluído via a assinatura de índice.
 */
export interface IntegrationLogFields {
  /** Provider da operação (label consistente). */
  provider: ProviderId;
  /** Operação lógica (ex.: "sync", "token_refresh", "webhook_process"). */
  operation: string;
  /** Desfecho estável e de baixa cardinalidade (ex.: "ok", "http_error"). */
  status: string;
  /** Conexão sobre a qual a operação atua (quando aplicável). */
  connectionId?: string;
  /** Status HTTP, quando a operação envolve uma chamada de rede. */
  httpStatus?: number;
  /** Metadados adicionais SEGUROS (não-sensíveis). */
  [key: string]: unknown;
}

/**
 * Chaves reconhecidamente sensíveis que devem ser OMITIDAS do meta de log.
 * Comparação case-insensitive por igualdade exata do nome da chave.
 *
 * Complementa a redação do `logger` cobrindo chaves específicas das integrações
 * (ciphertext/authTag/`code`/`client_secret`/`verify_token`/telefone/e-mail).
 */
const SENSITIVE_KEYS = new Set<string>([
  "accesstoken",
  "refreshtoken",
  "token",
  "idtoken",
  "password",
  "secret",
  "client_secret",
  "clientsecret",
  "ciphertext",
  "authtag",
  "code",
  "verify_token",
  "verifytoken",
  "phonee164",
  "phone",
  "email",
  "authorization",
  "cookie",
  "cpf",
  "apikey",
  "api_key",
]);

/**
 * Substrings que, se contidas no nome de uma chave, marcam-na como sensível.
 * Cobre variações como `userAccessToken`, `newRefreshToken`, `appSecret`, etc.
 */
const SENSITIVE_SUBSTRINGS = ["token", "secret", "password"];

/** Profundidade máxima ao varrer objetos aninhados (evita ciclos patológicos). */
const MAX_STRIP_DEPTH = 8;

/** Indica se uma chave deve ser omitida por ser (ou conter) algo sensível. */
function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (SENSITIVE_KEYS.has(normalized)) {
    return true;
  }
  return SENSITIVE_SUBSTRINGS.some((fragment) => normalized.includes(fragment));
}

/**
 * Remove recursivamente chaves sensíveis de `value`, retornando uma cópia segura.
 * Preserva primitivos e estruturas, apenas OMITINDO as chaves reconhecidas.
 */
function stripSensitive(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (depth >= MAX_STRIP_DEPTH || value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => stripSensitive(entry, seen, depth + 1));
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      continue; // Omite a chave sensível por completo.
    }
    result[key] = stripSensitive(nested, seen, depth + 1);
  }
  return result;
}

/**
 * Loga um evento de integração com campos padronizados, aplicando a rede de
 * segurança que omite chaves sensíveis antes de entregar ao logger.
 *
 * @param level nível de log (`info`/`warn`/`error`).
 * @param message mensagem legível (sem dados sensíveis).
 * @param fields campos padronizados + metadados seguros adicionais.
 *
 * _Requisitos: 20.1, 20.2, 20.3_
 */
export function logIntegrationEvent(
  level: IntegrationLogLevel,
  message: string,
  fields: IntegrationLogFields,
): void {
  const safeFields = stripSensitive(fields) as Record<string, unknown>;
  logger[level](message, safeFields);
}

/**
 * Exposto para testes: aplica apenas a remoção de chaves sensíveis a um objeto
 * de meta, sem logar. Permite asseverar a rede de segurança de forma isolada.
 *
 * @internal
 */
export function __stripSensitiveForTests(meta: Record<string, unknown>): Record<string, unknown> {
  return stripSensitive(meta) as Record<string, unknown>;
}
