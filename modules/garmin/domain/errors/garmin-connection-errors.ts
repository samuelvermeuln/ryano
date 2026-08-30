/**
 * Erros de conexão do Garmin (domínio).
 *
 * Movido de `server/services/garmin-connection-errors.ts` na tarefa 2.3. Mantido
 * verbatim para preservar o comportamento observável do Garmin (movimento
 * estrutural — Requisito 5.6). Um shim permanece no caminho antigo para não
 * quebrar os consumidores existentes (reporting/report-builder/rotas) até a
 * religação da tarefa 2.5.
 *
 * _Requisitos: 5.1, 5.2_
 */

export function isGarminAccountLockedErrorCode(errorCode?: string | null) {
  const normalized = errorCode?.toLowerCase() ?? "";

  return (
    normalized.includes("garmin_account_locked") ||
    normalized.includes("account locked") ||
    normalized.includes("account is locked") ||
    normalized.includes("account has been locked") ||
    normalized.includes("locked account") ||
    normalized.includes("temporarily locked") ||
    normalized.includes("password reset required") ||
    normalized.includes("reset your password") ||
    normalized.includes("recover password") ||
    (normalized.includes("locked") && (normalized.includes("account") || normalized.includes("password"))) ||
    (normalized.includes("bloquead") && (normalized.includes("conta") || normalized.includes("senha")))
  );
}
