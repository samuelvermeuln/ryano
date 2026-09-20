/**
 * T311 — correlationId
 * T312 — Structured logger for the escola module
 *
 * Every log line carries a correlationId (passed in or auto-generated),
 * the module name, and a structured payload so logs can be filtered by
 * provider / operation / correlationId in any NDJSON-aware sink.
 *
 * Usage:
 *   const log = schoolLogger("assign-workout", correlationId);
 *   log.info("workout_assigned", { assignmentId, athleteId });
 *   log.warn("matching_conflict", { reason });
 *   log.error("unexpected_failure", { error: err.message });
 */
import { randomUUID } from "node:crypto";

export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  module: string;
  operation: string;
  event: string;
  correlationId: string;
  timestamp: string;
  [key: string]: unknown;
};

export type SchoolLogger = {
  correlationId: string;
  info(event: string, payload?: Record<string, unknown>): void;
  warn(event: string, payload?: Record<string, unknown>): void;
  error(event: string, payload?: Record<string, unknown>): void;
};

/**
 * Creates a structured logger scoped to a module + operation pair.
 * Pass an existing correlationId to trace across service boundaries;
 * omit it to generate a new one.
 */
export function schoolLogger(operation: string, correlationId?: string): SchoolLogger {
  const id = correlationId ?? randomUUID();

  function write(level: LogLevel, event: string, payload: Record<string, unknown> = {}) {
    const entry: LogEntry = {
      level,
      module: "escola",
      operation,
      event,
      correlationId: id,
      timestamp: new Date().toISOString(),
      ...payload,
    };
    // Console serializes to NDJSON; in production use a structured sink.
    const serialized = JSON.stringify(entry);
    if (level === "error") {
      console.error(serialized);
    } else if (level === "warn") {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  }

  return {
    correlationId: id,
    info: (event, payload) => write("info", event, payload),
    warn: (event, payload) => write("warn", event, payload),
    error: (event, payload) => write("error", event, payload),
  };
}
