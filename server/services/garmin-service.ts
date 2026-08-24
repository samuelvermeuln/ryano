import { ConnectionStatus, SecretType, WearableProvider } from "@prisma/client";

import { prisma } from "@/server/db";
import { getPublicAppUrl } from "@/server/env";
import {
  DEFAULT_GARMIN_MAX_USERS_PER_RUN,
  DEFAULT_GARMIN_SYNC_DELAY_SECONDS,
  getStoredGarminReportingSettings,
} from "@/server/garmin-reporting-settings";
import { logger } from "@/server/logging/logger";
import { evolutionProvider } from "@/server/providers/messaging/evolution";
import { garminProvider } from "@/server/providers/wearables/garmin";
import { decryptSecret, encryptSecret } from "@/server/crypto/secret-vault";
import { normalizeGarminActivity } from "@/server/services/activity-normalizer";
import { enqueuePostActivityReport } from "@/server/services/reporting";

const GARMIN_PAGE_SIZE = 20;
const GARMIN_MAX_PAGES = 10;

export type GarminSyncBatchResult = {
  eligibleUsers: number;
  scannedUsers: number;
  remainingUsers: number;
  syncedUsers: number;
  failedUsers: number;
  maxUsersPerRun: number;
  delayBetweenUserSyncSeconds: number;
  syncResults: Array<{ userId: string; ok: boolean; syncedCount?: number; error?: string }>;
};

async function upsertSecret(connectionId: string, secretType: SecretType, value: string) {
  const encrypted = encryptSecret(value);

  await prisma.wearableSecret.upsert({
    where: {
      wearableConnectionId_secretType: {
        wearableConnectionId: connectionId,
        secretType,
      },
    },
    update: encrypted,
    create: {
      wearableConnectionId: connectionId,
      secretType,
      ...encrypted,
    },
  });
}

async function getSecret(connectionId: string, secretType: SecretType) {
  const secret = await prisma.wearableSecret.findUnique({
    where: {
      wearableConnectionId_secretType: {
        wearableConnectionId: connectionId,
        secretType,
      },
    },
  });

  if (!secret) {
    return null;
  }

  return decryptSecret(secret);
}

export async function connectGarminForUser(input: {
  userId: string;
  email: string;
  password: string;
  label: string;
}) {
  const result = await garminProvider.connect({
    email: input.email,
    password: input.password,
    label: input.label,
  });

  if (result.status === "error") {
    throw new Error(result.message ?? (result.mfaRequired ? "GARMIN_MFA_REQUIRED" : "GARMIN_CONNECT_FAILED"));
  }

  const connection = await prisma.wearableConnection.upsert({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: WearableProvider.GARMIN,
      },
    },
    update: {
      externalAccountId: result.externalAccountId,
      label: input.label,
      status: result.accountApiKey ? "SYNCING" : "ERROR",
      capabilities: ["activities"],
      lastSyncStatus: result.accountApiKey ? "VALIDATING" : "MISSING_ACCOUNT_API_KEY",
      lastErrorCode: result.accountApiKey ? null : "MISSING_ACCOUNT_API_KEY",
    },
    create: {
      userId: input.userId,
      provider: WearableProvider.GARMIN,
      externalAccountId: result.externalAccountId,
      label: input.label,
      status: result.accountApiKey ? "SYNCING" : "ERROR",
      capabilities: ["activities"],
      lastSyncStatus: result.accountApiKey ? "VALIDATING" : "MISSING_ACCOUNT_API_KEY",
      lastErrorCode: result.accountApiKey ? null : "MISSING_ACCOUNT_API_KEY",
    },
  });

  await upsertSecret(connection.id, "GARMIN_EMAIL", input.email);
  await upsertSecret(connection.id, "GARMIN_PASSWORD", input.password);

  if (result.accountApiKey) {
    await upsertSecret(connection.id, "GARMIN_API_KEY", result.accountApiKey);
  }

  if (!result.accountApiKey) {
    throw new Error("MISSING_ACCOUNT_API_KEY");
  }

  const validation = await garminProvider.validateConnection({
    accountApiKey: result.accountApiKey,
  });

  if (!validation.ok) {
    await prisma.wearableConnection.update({
      where: { id: connection.id },
      data: {
        status: "ERROR",
        lastSyncStatus: "VALIDATION_FAILED",
        lastErrorCode: validation.message ?? "GARMIN_VALIDATE_FAILED",
      },
    });

    throw new Error(validation.message ?? "GARMIN_VALIDATE_FAILED");
  }

  await syncGarminForUser(input.userId, { queuePostActivityReports: false });

  return prisma.wearableConnection.findUniqueOrThrow({
    where: { id: connection.id },
  });
}

export async function syncGarminForUser(
  userId: string,
  input?: { queuePostActivityReports?: boolean; allowReconnectAttempt?: boolean },
) {
  const connection = await prisma.wearableConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: WearableProvider.GARMIN,
      },
    },
  });

  if (!connection) {
    throw new Error("GARMIN_NOT_CONNECTED");
  }

  const accountApiKey = await getSecret(connection.id, "GARMIN_API_KEY");

  if (!accountApiKey) {
    throw new Error("GARMIN_ACCOUNT_API_KEY_MISSING");
  }

  await prisma.wearableConnection.update({
    where: { id: connection.id },
    data: {
      status: "SYNCING",
      lastSyncStatus: "IN_PROGRESS",
      lastErrorCode: null,
    },
  });

  try {
    let syncedCount = 0;

    for (let page = 0; page < GARMIN_MAX_PAGES; page += 1) {
      const rawActivities = await garminProvider.syncActivities({
        accountApiKey,
        limit: GARMIN_PAGE_SIZE,
        start: page * GARMIN_PAGE_SIZE,
      });

      if (!rawActivities.length) {
        break;
      }

      for (const rawActivity of rawActivities) {
        if (!rawActivity || typeof rawActivity !== "object") {
          continue;
        }

        const normalized = normalizeGarminActivity(rawActivity as Record<string, unknown>);

        const existing = await prisma.activity.findUnique({
          where: {
            provider_externalId_userId: {
              provider: WearableProvider.GARMIN,
              externalId: normalized.externalId,
              userId,
            },
          },
          select: { id: true },
        });

        const activity = await prisma.activity.upsert({
          where: {
            provider_externalId_userId: {
              provider: WearableProvider.GARMIN,
              externalId: normalized.externalId,
              userId,
            },
          },
          update: {
            ...normalized,
            wearableConnectionId: connection.id,
            userId,
          },
          create: {
            ...normalized,
            wearableConnectionId: connection.id,
            userId,
          },
        });

        syncedCount += 1;

        if (!existing && input?.queuePostActivityReports !== false) {
          await enqueuePostActivityReport(activity.id);
        }
      }

      if (rawActivities.length < GARMIN_PAGE_SIZE) {
        break;
      }
    }

    await prisma.wearableConnection.update({
      where: { id: connection.id },
      data: {
        status: "CONNECTED",
        lastSyncAt: new Date(),
        lastSyncStatus: `SYNCED_${syncedCount}`,
        lastErrorCode: null,
      },
    });

    return { syncedCount };
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "GARMIN_SYNC_FAILED";
    const allowReconnectAttempt = input?.allowReconnectAttempt !== false;

    if (allowReconnectAttempt && shouldAttemptGarminRevalidation(errorCode)) {
      const reconnectResult = await revalidateGarminConnection(connection.id);

      if (reconnectResult.ok) {
        return syncGarminForUser(userId, {
          ...input,
          allowReconnectAttempt: false,
        });
      }

      await markGarminReconnectRequired({
        connectionId: connection.id,
        userId,
        previousStatus: connection.status,
        errorCode: reconnectResult.errorCode,
      });

      throw new Error(reconnectResult.userMessage);
    }

    await prisma.wearableConnection.update({
      where: { id: connection.id },
      data: {
        status: "ERROR",
        lastSyncStatus: "FAILED",
        lastErrorCode: errorCode,
      },
    });

    throw error;
  }
}

function shouldAttemptGarminRevalidation(errorCode: string) {
  return ["GARMIN_SYNC_401", "GARMIN_SYNC_403", "GARMIN_VALIDATE_401", "GARMIN_VALIDATE_403"]
    .some((prefix) => errorCode.startsWith(prefix));
}

async function revalidateGarminConnection(connectionId: string) {
  const accountApiKey = await getSecret(connectionId, "GARMIN_API_KEY");

  if (!accountApiKey || !garminProvider.reconnect) {
    return {
      ok: false,
      errorCode: "GARMIN_RECONNECT_UNAVAILABLE",
      userMessage: "Sua conexão com a Garmin precisa ser revalidada no aplicativo.",
    };
  }

  const reconnect = await garminProvider.reconnect({ accountApiKey });

  if (reconnect.ok) {
    await prisma.wearableConnection.update({
      where: { id: connectionId },
      data: {
        status: "SYNCING",
        lastSyncStatus: "REVALIDATED",
        lastErrorCode: null,
      },
    });

    return {
      ok: true,
      errorCode: "GARMIN_RECONNECTED",
      userMessage: "GARMIN_RECONNECTED",
    };
  }

  if (reconnect.mfaRequired) {
    return {
      ok: false,
      errorCode: "GARMIN_MFA_REQUIRED",
      userMessage: "A Garmin exige autenticação em duas etapas nesta conta. Desative o 2FA na Garmin e faça a conexão novamente.",
    };
  }

  return {
    ok: false,
    errorCode: reconnect.message ?? "GARMIN_RECONNECT_FAILED",
    userMessage: "Sua conexão com a Garmin precisa ser revalidada. Abra o link enviado no WhatsApp para conectar novamente.",
  };
}

async function markGarminReconnectRequired(input: {
  connectionId: string;
  userId: string;
  previousStatus: ConnectionStatus;
  errorCode: string;
}) {
  await prisma.wearableConnection.update({
    where: { id: input.connectionId },
    data: {
      status: "RECONNECT_REQUIRED",
      lastSyncStatus: "RECONNECT_REQUIRED",
      lastErrorCode: input.errorCode,
    },
  });

  if (input.previousStatus !== ConnectionStatus.RECONNECT_REQUIRED) {
    await notifyGarminReconnectRequired(input.userId, input.errorCode);
  }
}

async function notifyGarminReconnectRequired(userId: string, errorCode: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      whatsappIdentity: true,
    },
  });

  if (!user?.whatsappIdentity?.verifiedAt) {
    return;
  }

  const revalidateUrl = new URL("/app/integracoes?garmin=revalidar", getPublicAppUrl()).toString();
  const mfaRequired = errorCode === "GARMIN_MFA_REQUIRED";
  const text = mfaRequired
    ? `Sua conexão com a Garmin precisa ser revalidada no ryvano. A Garmin informou que esta conta está com autenticação em duas etapas ativa. Desative o 2FA na Garmin e toque no link para conectar novamente: ${revalidateUrl}`
    : `Sua conexão com a Garmin precisa ser revalidada no ryvano. Toque no link para conectar novamente: ${revalidateUrl}`;

  try {
    await evolutionProvider.sendText({
      to: user.whatsappIdentity.phoneE164,
      text,
    });
  } catch (error) {
    logger.error("Failed to send Garmin reconnect WhatsApp notification", {
      error,
      userId,
      errorCode,
    });
  }
}

export async function getNextGarminSyncQueuePreview(input?: { limit?: number }) {
  const settings = await getStoredGarminReportingSettings();
  const limit = input?.limit ?? settings.maxUsersPerRun ?? DEFAULT_GARMIN_MAX_USERS_PER_RUN;

  return prisma.wearableConnection.findMany({
    where: {
      provider: WearableProvider.GARMIN,
      status: {
        in: [ConnectionStatus.CONNECTED, ConnectionStatus.SYNCING, ConnectionStatus.ERROR],
      },
    },
    select: {
      userId: true,
      lastSyncAt: true,
      updatedAt: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: [{ lastSyncAt: "asc" }, { updatedAt: "asc" }],
    take: limit,
  });
}

export async function syncAllGarminUsers(input?: {
  userId?: string;
  maxUsersPerRun?: number;
  delayBetweenUserSyncSeconds?: number;
}): Promise<GarminSyncBatchResult> {
  const settings = await getStoredGarminReportingSettings();
  const maxUsersPerRun = input?.maxUsersPerRun ?? settings.maxUsersPerRun ?? DEFAULT_GARMIN_MAX_USERS_PER_RUN;
  const delayBetweenUserSyncSeconds = input?.delayBetweenUserSyncSeconds ?? settings.delayBetweenUserSyncSeconds ?? DEFAULT_GARMIN_SYNC_DELAY_SECONDS;

  const where = {
    userId: input?.userId,
    provider: WearableProvider.GARMIN,
    status: {
      in: [ConnectionStatus.CONNECTED, ConnectionStatus.SYNCING, ConnectionStatus.ERROR],
    },
  };

  const eligibleUsers = await prisma.wearableConnection.count({ where });
  const connections = await prisma.wearableConnection.findMany({
    where,
    select: {
      userId: true,
      lastSyncAt: true,
      updatedAt: true,
    },
    orderBy: [{ lastSyncAt: "asc" }, { updatedAt: "asc" }],
    take: maxUsersPerRun,
  });

  const syncResults: GarminSyncBatchResult["syncResults"] = [];

  for (const [index, connection] of connections.entries()) {
    try {
      const result = await syncGarminForUser(connection.userId);
      syncResults.push({
        userId: connection.userId,
        ok: true,
        syncedCount: result.syncedCount,
      });
    } catch (error) {
      logger.error("Failed to sync Garmin user in batch", {
        error,
        userId: connection.userId,
      });
      syncResults.push({
        userId: connection.userId,
        ok: false,
        error: error instanceof Error ? error.message : "GARMIN_SYNC_FAILED",
      });
    }

    if (index < connections.length - 1 && delayBetweenUserSyncSeconds > 0) {
      await wait(delayBetweenUserSyncSeconds * 1000);
    }
  }

  return {
    eligibleUsers,
    scannedUsers: connections.length,
    remainingUsers: Math.max(0, eligibleUsers - connections.length),
    syncedUsers: syncResults.filter((result) => result.ok).length,
    failedUsers: syncResults.filter((result) => !result.ok).length,
    maxUsersPerRun,
    delayBetweenUserSyncSeconds,
    syncResults,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function disconnectGarminForUser(userId: string) {
  const connection = await prisma.wearableConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: WearableProvider.GARMIN,
      },
    },
  });

  if (!connection) {
    return;
  }

  await prisma.wearableSecret.deleteMany({
    where: { wearableConnectionId: connection.id },
  });

  await prisma.wearableConnection.update({
    where: { id: connection.id },
    data: {
      status: "DISCONNECTED",
      lastSyncStatus: "DISCONNECTED",
      lastErrorCode: null,
    },
  });
}
