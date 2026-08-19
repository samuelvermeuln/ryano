import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  APP_URL: z.string().url().optional(),
  DATA_ENCRYPTION_KEY: z.string().min(1).optional(),
  GARMIN_SERVICE_BASE_URL: z.string().url().optional(),
  GARMIN_ADMIN_KEY: z.string().min(1).optional(),
  EVOLUTION_API_BASE_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().min(1).optional(),
  EVOLUTION_INSTANCE_NAME: z.string().min(1).optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().min(1).optional(),
  RYANO_WHATSAPP_NUMBER: z.string().min(1).optional(),
});

const parsedEnv = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_URL: process.env.AUTH_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  APP_URL: process.env.APP_URL,
  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
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
