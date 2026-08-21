import { NextResponse } from "next/server";

import { prisma } from "@/server/db";
import { env, getAuthUrl, hasGoogleOAuthEnv, hasPasswordResetEmailEnv } from "@/server/env";

export const dynamic = "force-dynamic";

function isConfigured(value: unknown) {
  return Boolean(value);
}

export async function GET() {
  const config = {
    databaseUrl: isConfigured(env.DATABASE_URL),
    authSecret: isConfigured(env.AUTH_SECRET),
    authUrl: isConfigured(getAuthUrl()),
    appUrl: isConfigured(env.APP_URL),
    dataEncryptionKey: isConfigured(env.DATA_ENCRYPTION_KEY),
    googleOAuth: hasGoogleOAuthEnv(),
    email: hasPasswordResetEmailEnv(),
    garmin: Boolean(env.GARMIN_SERVICE_BASE_URL && env.GARMIN_ADMIN_KEY),
    evolution: Boolean(env.EVOLUTION_API_BASE_URL && env.EVOLUTION_API_KEY),
  };

  let database = {
    ok: false,
    error: null as string | null,
  };

  if (config.databaseUrl) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = { ok: true, error: null };
    } catch (error) {
      database = {
        ok: false,
        error: error instanceof Error ? error.message : "DATABASE_UNAVAILABLE",
      };
    }
  } else {
    database = {
      ok: false,
      error: "DATABASE_URL_MISSING",
    };
  }

  const coreConfigOk =
    config.databaseUrl &&
    config.authSecret &&
    config.authUrl &&
    config.appUrl &&
    config.dataEncryptionKey;

  const ready = Boolean(coreConfigOk && database.ok);

  return NextResponse.json(
    {
      ok: ready,
      service: "ryano-web",
      ready,
      database,
      config,
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}
