import { SecretType, WearableProvider } from "@prisma/client";

import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";
import { evolutionProvider } from "@/server/providers/messaging/evolution";
import { garminProvider } from "@/server/providers/wearables/garmin";
import { decryptSecret, encryptSecret } from "@/server/crypto/secret-vault";
import { normalizeGarminActivity } from "@/server/services/activity-normalizer";
import { buildPostActivityReport } from "@/server/services/report-builder";

const GARMIN_PAGE_SIZE = 20;
const GARMIN_MAX_PAGES = 10;

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

async function sendPostActivityReport(activityId: string) {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: {
      user: {
        include: {
          profile: true,
          whatsappIdentity: true,
          notificationPreference: true,
        },
      },
    },
  });

  if (!activity?.user.whatsappIdentity?.verifiedAt || !activity.user.notificationPreference?.postActivityReport) {
    return;
  }

  const type = `POST_ACTIVITY_REPORT:${activity.id}`;
  const content = buildPostActivityReport({
    user: {
      name: activity.user.name,
      profile: activity.user.profile,
    },
    activity,
  });

  const delivery = await prisma.messageDelivery.upsert({
    where: {
      userId_type: {
        userId: activity.userId,
        type,
      },
    },
    update: {},
    create: {
      userId: activity.userId,
      channel: "WHATSAPP",
      type,
      provider: "EVOLUTION",
      status: "PENDING",
    },
  });

  if (delivery.status !== "PENDING") {
    return;
  }

  try {
    const result = await evolutionProvider.sendText({
      to: activity.user.whatsappIdentity.phoneE164,
      text: content,
    });

    await prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: result.status === "sent" ? "SENT" : "FAILED",
        externalMessageId: result.externalMessageId,
        sentAt: result.status === "sent" ? new Date() : null,
        failedAt: result.status === "failed" ? new Date() : null,
      },
    });
  } catch (error) {
    logger.error("Failed to send post-activity report", { error, activityId });
    await prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        errorCode: "EVOLUTION_SEND_FAILED",
      },
    });
  }
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
    throw new Error(result.message ?? "GARMIN_CONNECT_FAILED");
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

  await syncGarminForUser(input.userId);

  return prisma.wearableConnection.findUniqueOrThrow({
    where: { id: connection.id },
  });
}

export async function syncGarminForUser(userId: string) {
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

        if (!existing) {
          await sendPostActivityReport(activity.id);
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
