import { z } from "zod";

function emptyToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalString = () => z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = () => z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalBooleanString = () => z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional());

export const DEFAULT_EVOLUTION_INSTANCE_NAME = "ryvano";
export const DEFAULT_EVOLUTION_WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "GROUPS_UPSERT",
  "GROUP_UPDATE",
  "GROUP_PARTICIPANTS_UPDATE",
  "MESSAGES_UPSERT",
] as const;

const envSchema = z.object({
  DATABASE_URL: optionalString(),
  AUTH_SECRET: optionalString(),
  AUTH_URL: optionalUrl(),
  NEXTAUTH_URL: optionalUrl(),
  AUTH_TRUST_HOST: optionalBooleanString(),
  GOOGLE_CLIENT_ID: optionalString(),
  GOOGLE_CLIENT_SECRET: optionalString(),
  APP_URL: optionalUrl(),
  DATA_ENCRYPTION_KEY: optionalString(),
  SEND_API_URL: optionalUrl(),
  SEND_API_KEY: optionalString(),
  SEND_FROM: optionalString(),
  GARMIN_SERVICE_BASE_URL: optionalUrl(),
  GARMIN_ADMIN_KEY: optionalString(),
  GARMIN_MAX_PROBES_PER_RUN: optionalString(),
  STRAVA_ADMIN_KEY: optionalString(),
  EVOLUTION_API_BASE_URL: optionalUrl(),
  EVOLUTION_API_KEY: optionalString(),
  EVOLUTION_INSTANCE_NAME: optionalString(),
  EVOLUTION_WEBHOOK_SECRET: optionalString(),
  EVOLUTION_WEBHOOK_EVENTS: optionalString(),
  EVOLUTION_ALLOW_HTTP_FALLBACK: optionalBooleanString(),
});

const parsedEnv = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_URL: process.env.AUTH_URL,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  APP_URL: process.env.APP_URL,
  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
  SEND_API_URL: process.env.SEND_API_URL,
  SEND_API_KEY: process.env.SEND_API_KEY,
  SEND_FROM: process.env.SEND_FROM,
  GARMIN_SERVICE_BASE_URL: process.env.GARMIN_SERVICE_BASE_URL,
  GARMIN_ADMIN_KEY: process.env.GARMIN_ADMIN_KEY,
  GARMIN_MAX_PROBES_PER_RUN: process.env.GARMIN_MAX_PROBES_PER_RUN,
  STRAVA_ADMIN_KEY: process.env.STRAVA_ADMIN_KEY,
  EVOLUTION_API_BASE_URL: process.env.EVOLUTION_API_BASE_URL,
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
  EVOLUTION_INSTANCE_NAME: process.env.EVOLUTION_INSTANCE_NAME,
  EVOLUTION_WEBHOOK_SECRET: process.env.EVOLUTION_WEBHOOK_SECRET,
  EVOLUTION_WEBHOOK_EVENTS: process.env.EVOLUTION_WEBHOOK_EVENTS,
  EVOLUTION_ALLOW_HTTP_FALLBACK: process.env.EVOLUTION_ALLOW_HTTP_FALLBACK,
});

export const env = parsedEnv;

export function requireEnv<K extends keyof typeof env>(key: K) {
  const value = env[key];

  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
}

export function getAuthUrl() {
  return env.NEXTAUTH_URL ?? env.AUTH_URL ?? env.APP_URL ?? "http://localhost:3000";
}

export function getPublicAppUrl() {
  return env.APP_URL ?? getAuthUrl();
}

export function getIndexableAppUrl() {
  const publicAppUrl = env.APP_URL;

  if (!publicAppUrl) {
    return undefined;
  }

  const hostname = new URL(publicAppUrl).hostname;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return undefined;
  }

  return publicAppUrl;
}

export function hasGoogleOAuthEnv() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function hasPasswordResetEmailEnv() {
  return Boolean(env.SEND_API_URL && env.SEND_API_KEY && env.SEND_FROM);
}

export function getEvolutionInstanceName() {
  return env.EVOLUTION_INSTANCE_NAME ?? DEFAULT_EVOLUTION_INSTANCE_NAME;
}

export function getEvolutionWebhookEvents() {
  const configured = env.EVOLUTION_WEBHOOK_EVENTS
    ?.split(",")
    .map((event) => event.trim())
    .filter(Boolean);

  return configured && configured.length > 0 ? configured : [...DEFAULT_EVOLUTION_WEBHOOK_EVENTS];
}

export function isEvolutionHttpFallbackAllowed() {
  return env.EVOLUTION_ALLOW_HTTP_FALLBACK !== "false";
}

export function getEvolutionWebhookUrl(input?: { allowHttpFallback?: boolean }) {
  const baseUrl = getPublicAppUrl();
  const allowHttpFallback = input?.allowHttpFallback ?? isEvolutionHttpFallbackAllowed();
  const url = new URL("/api/webhooks/evolution", baseUrl);

  if (url.protocol !== "https:" && !allowHttpFallback) {
    throw new Error("EVOLUTION_HTTP_FALLBACK_DISABLED");
  }

  return url.toString();
}
