import { z } from "zod";

function emptyToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalString = () => z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = () => z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalPort = () => z.preprocess(emptyToUndefined, z.string().regex(/^\d+$/).optional());
const optionalBooleanString = () => z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional());

const envSchema = z.object({
  DATABASE_URL: optionalString(),
  AUTH_SECRET: optionalString(),
  AUTH_URL: optionalUrl(),
  GOOGLE_CLIENT_ID: optionalString(),
  GOOGLE_CLIENT_SECRET: optionalString(),
  APP_URL: optionalUrl(),
  DATA_ENCRYPTION_KEY: optionalString(),
  SMTP_HOST: optionalString(),
  SMTP_PORT: optionalPort(),
  SMTP_USER: optionalString(),
  SMTP_PASSWORD: optionalString(),
  SMTP_FROM: optionalString(),
  SMTP_SECURE: optionalBooleanString(),
  GARMIN_SERVICE_BASE_URL: optionalUrl(),
  GARMIN_ADMIN_KEY: optionalString(),
  EVOLUTION_API_BASE_URL: optionalUrl(),
  EVOLUTION_API_KEY: optionalString(),
  EVOLUTION_INSTANCE_NAME: optionalString(),
  EVOLUTION_WEBHOOK_SECRET: optionalString(),
  RYANO_WHATSAPP_NUMBER: optionalString(),
});

const parsedEnv = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_URL: process.env.AUTH_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  APP_URL: process.env.APP_URL,
  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  SMTP_FROM: process.env.SMTP_FROM,
  SMTP_SECURE: process.env.SMTP_SECURE,
  GARMIN_SERVICE_BASE_URL: process.env.GARMIN_SERVICE_BASE_URL,
  GARMIN_ADMIN_KEY: process.env.GARMIN_ADMIN_KEY,
  EVOLUTION_API_BASE_URL: process.env.EVOLUTION_API_BASE_URL,
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
  EVOLUTION_INSTANCE_NAME: process.env.EVOLUTION_INSTANCE_NAME,
  EVOLUTION_WEBHOOK_SECRET: process.env.EVOLUTION_WEBHOOK_SECRET,
  RYANO_WHATSAPP_NUMBER: process.env.RYANO_WHATSAPP_NUMBER,
});

export const env = parsedEnv;

export function requireEnv<K extends keyof typeof env>(key: K) {
  const value = env[key];

  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
}

export function hasGoogleOAuthEnv() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function hasPasswordResetEmailEnv() {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM);
}

export function isSmtpSecure() {
  return env.SMTP_SECURE === "true";
}
