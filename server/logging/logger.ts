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

const MAX_REDACTION_DEPTH = 8;

function redact(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth >= MAX_REDACTION_DEPTH) {
    return "[TRUNCATED]";
  }

  if (value instanceof Error) {
    const errorPayload = {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...Object.fromEntries(Object.entries(value)),
    };

    return redact(errorPayload, seen, depth + 1);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, seen, depth + 1));
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);

    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        const shouldRedact = SENSITIVE_KEYS.some((sensitiveKey) =>
          key.toLowerCase().includes(sensitiveKey.toLowerCase()),
        );

        return [key, shouldRedact ? "[REDACTED]" : redact(nested, seen, depth + 1)];
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
