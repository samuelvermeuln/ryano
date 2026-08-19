const SENSITIVE_KEYS = [
  "password",
  "authorization",
  "cookie",
  "token",
  "secret",
  "cpf",
  "apiKey",
  "api_key",
  "access_token",
  "refresh_token",
  "id_token",
];

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        const shouldRedact = SENSITIVE_KEYS.some((sensitiveKey) =>
          key.toLowerCase().includes(sensitiveKey.toLowerCase()),
        );

        return [key, shouldRedact ? "[REDACTED]" : redact(nested)];
      }),
    );
  }

  return value;
}

function write(level: "info" | "warn" | "error", message: string, context?: unknown) {
  const payload = {
    level,
    message,
    context: context ? redact(context) : undefined,
    timestamp: new Date().toISOString(),
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info(message: string, context?: unknown) {
    write("info", message, context);
  },
  warn(message: string, context?: unknown) {
    write("warn", message, context);
  },
  error(message: string, context?: unknown) {
    write("error", message, context);
  },
};
