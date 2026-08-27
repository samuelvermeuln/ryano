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
