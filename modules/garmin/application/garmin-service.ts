/**
 * Serviço de aplicação do Garmin (connect / sync / disconnect / notifications).
 *
 * Movido de `server/services/garmin-service.ts` na tarefa 2.3. Este é o arquivo
 * canônico de implementação; as concerns são expostas por wrappers finos em
 * `application/{connect,sync,disconnect,notifications}` (barrels de reexport).
 * A implementação foi mantida verbatim — apenas os imports foram religados para
 * os novos caminhos do módulo — para preservar o comportamento observável do
 * Garmin (movimento estrutural — Requisito 5.6). Um shim permanece no caminho
 * antigo até a religação da tarefa 2.5.
 *
 * CICLO DE DEPENDÊNCIA QUEBRADO (tarefa 2.4): este módulo depende apenas da
 * camada genérica compartilhada de fila/entrega. As funções genéricas
 * (`dispatchPendingWhatsAppDeliveries`, `enqueuePostActivityReport`) vêm de
 * `@/server/services/reporting` (que NÃO importa mais nada do Garmin), e o
 * enfileirador específico de reconexão (`enqueueGarminReconnectReport`) vem da
 * camada de relatórios do próprio módulo (`@/modules/garmin/application/reporting`),
 * cujo import também registra os materializadores/hook/configurações do Garmin
 * no registro compartilhado. Assim a dependência é unidirecional (Garmin →
 * camada compartilhada) e o ciclo Garmin ↔ reporting deixou de existir.
 *
 * _Requisitos: 5.1, 5.2, 9.6_
 */

import { ConnectionStatus, SecretType, WearableProvider } from "@prisma/client";

import { prisma } from "@/server/db";
import {
  DEFAULT_GARMIN_MAX_PROBES_PER_RUN,
  DEFAULT_GARMIN_MAX_USERS_PER_RUN,
  DEFAULT_GARMIN_SYNC_DELAY_SECONDS,
  getStoredGarminReportingSettings,
} from "@/modules/garmin/config";
import { logger } from "@/server/logging/logger";
import { garminProvider } from "@/modules/garmin/infrastructure/provider";
import { decryptSecret, encryptSecret } from "@/server/crypto/secret-vault";
import { normalizeGarminActivity } from "@/modules/garmin/parsers/parse-garmin-activity";
import { isGarminAccountLockedErrorCode } from "@/modules/garmin/domain/errors";
import {
  GARMIN_RECONNECT_NOTIFICATION_FAILED_EVENT,
  GARMIN_RECONNECT_NOTIFICATION_SENT_EVENT,
} from "@/modules/garmin/domain/events";
import { enqueueGarminReconnectReport } from "@/modules/garmin/application/reporting";
import {
  cacheGarminActivitySplits,
  needsGarminActivitySplitBackfill,
} from "@/modules/garmin/application/activities/garmin-activity-details";
import {
  dispatchPendingWhatsAppDeliveries,
  enqueuePostActivityReport,
} from "@/server/services/reporting";

const GARMIN_PAGE_SIZE = 20;
const GARMIN_MAX_PAGES = 10;
const GARMIN_FAST_PROBE_INTERVAL_MS = 60 * 1000;
const GARMIN_STANDARD_PROBE_INTERVAL_MS = 15 * 60 * 1000;
const GARMIN_RECENT_ACTIVITY_REPORT_WINDOW_MS = 36 * 60 * 60 * 1000;
const GARMIN_PROBE_ERROR_BACKOFF_MS = [5, 15, 30, 60].map((minutes) => minutes * 60 * 1000);
export const GARMIN_RECONNECT_NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000;

export type GarminReconnectNotificationSummary = {
  eventType: typeof GARMIN_RECONNECT_NOTIFICATION_SENT_EVENT | typeof GARMIN_RECONNECT_NOTIFICATION_FAILED_EVENT;
  createdAt: Date;
  reason: string | null;
  errorCode: string | null;
  reconnectUrl: string | null;
  sentTo: string | null;
  message: string | null;
};

function getJsonString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export async function getLatestGarminReconnectNotification(userId: string): Promise<GarminReconnectNotificationSummary | null> {
  const event = await prisma.integrationEvent.findFirst({
    where: {
      userId,
      provider: "GARMIN",
      eventType: {
        in: [GARMIN_RECONNECT_NOTIFICATION_SENT_EVENT, GARMIN_RECONNECT_NOTIFICATION_FAILED_EVENT],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!event) {
    return null;
  }

  return {
    eventType: event.eventType as GarminReconnectNotificationSummary["eventType"],
    createdAt: event.createdAt,
    reason: getJsonString(event.payload, "reason"),
    errorCode: getJsonString(event.payload, "errorCode"),
    reconnectUrl: getJsonString(event.payload, "reconnectUrl"),
    sentTo: getJsonString(event.payload, "sentTo"),
    message: getJsonString(event.payload, "message"),
  };
}

export async function getGarminReconnectNotificationCooldown(userId: string) {
  const latestSentEvent = await prisma.integrationEvent.findFirst({
    where: {
      userId,
      provider: "GARMIN",
      eventType: GARMIN_RECONNECT_NOTIFICATION_SENT_EVENT,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      createdAt: true,
    },
  });

  if (!latestSentEvent) {
    return {
      active: false,
      lastSentAt: null,
      availableAt: null,
      remainingMs: 0,
    };
  }

  const availableAt = new Date(latestSentEvent.createdAt.getTime() + GARMIN_RECONNECT_NOTIFICATION_COOLDOWN_MS);
  const remainingMs = Math.max(0, availableAt.getTime() - Date.now());

  return {
    active: remainingMs > 0,
    lastSentAt: latestSentEvent.createdAt,
    availableAt,
    remainingMs,
  };
}

export type GarminSyncBatchResult = {
  eligibleUsers: number;
  scannedUsers: number;
  remainingUsers: number;
  syncedUsers: number;
  failedUsers: number;
  maxUsersPerRun: number;
  maxProbesPerRun: number;
  delayBetweenUserSyncSeconds: number;
  syncResults: Array<{
    userId: string;
    ok: boolean;
    syncedCount?: number;
    latestActivityExternalId?: string | null;
    changed?: boolean;
    error?: string;
  }>;
};

type PostActivityReportMode = "all-new" | "latest-recent-new" | "none";

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
  const startedAt = Date.now();

  logger.info("Garmin user connection started", {
    userId: input.userId,
    label: input.label,
  });

  const result = await garminProvider.connect({
    email: input.email,
    password: input.password,
    label: input.label,
  });

  logger.info("Garmin provider connect returned", {
    userId: input.userId,
    status: result.status,
    mfaRequired: Boolean(result.mfaRequired),
    hasAccountApiKey: Boolean(result.accountApiKey),
    externalAccountId: result.externalAccountId ?? null,
    durationMs: Date.now() - startedAt,
  });

  if (result.status === "error") {
    logger.warn("Garmin provider connect failed", {
      userId: input.userId,
      message: result.message,
      mfaRequired: Boolean(result.mfaRequired),
      hasAccountApiKey: Boolean(result.accountApiKey),
      durationMs: Date.now() - startedAt,
    });

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

  logger.info("Garmin wearable connection upserted", {
    userId: input.userId,
    connectionId: connection.id,
    status: connection.status,
    hasAccountApiKey: Boolean(result.accountApiKey),
  });

  await upsertSecret(connection.id, "GARMIN_EMAIL", input.email);
  await upsertSecret(connection.id, "GARMIN_PASSWORD", input.password);

  if (result.accountApiKey) {
    await upsertSecret(connection.id, "GARMIN_API_KEY", result.accountApiKey);
  }

  logger.info("Garmin wearable secrets persisted", {
    userId: input.userId,
    connectionId: connection.id,
    hasAccountApiKey: Boolean(result.accountApiKey),
  });

  if (!result.accountApiKey) {
    logger.warn("Garmin provider response missing account API key", {
      userId: input.userId,
      connectionId: connection.id,
      durationMs: Date.now() - startedAt,
    });

    throw new Error("MISSING_ACCOUNT_API_KEY");
  }

  await prisma.wearableConnection.update({
    where: { id: connection.id },
    data: {
      status: "CONNECTED",
      lastSyncStatus: "CONNECTED",
      lastErrorCode: null,
    },
  });

  logger.info("Garmin user connection completed", {
    userId: input.userId,
    connectionId: connection.id,
    durationMs: Date.now() - startedAt,
  });

  return prisma.wearableConnection.findUniqueOrThrow({
    where: { id: connection.id },
  });
}

export async function syncGarminForUser(
  userId: string,
  input?: {
    queuePostActivityReports?: boolean;
    allowReconnectAttempt?: boolean;
    postActivityReportMode?: PostActivityReportMode;
    recentActivityReportWindowMs?: number;
  },
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
    let createdCount = 0;
    let latestSyncedActivity: { externalId: string; startedAt: Date } | null = null;
    let latestRecentCreatedActivity: { id: string; startedAt: Date } | null = null;
    const postActivityReportMode = resolvePostActivityReportMode(input);
    const recentActivityReportWindowMs = input?.recentActivityReportWindowMs ?? GARMIN_RECENT_ACTIVITY_REPORT_WINDOW_MS;
    const syncStartedAt = new Date();

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
          select: { id: true, metrics: true },
        });

        const cachedActivityDetails = existing?.metrics && typeof existing.metrics === "object" && !Array.isArray(existing.metrics)
          ? (existing.metrics as Record<string, unknown>).garminActivityDetails
          : undefined;
        const normalizedWithCachedDetails = cachedActivityDetails === undefined
          ? normalized
          : {
              ...normalized,
              metrics: {
                ...(normalized.metrics as Record<string, unknown>),
                garminActivityDetails: cachedActivityDetails,
              } as typeof normalized.metrics,
            };

        const activity = await prisma.activity.upsert({
          where: {
            provider_externalId_userId: {
              provider: WearableProvider.GARMIN,
              externalId: normalized.externalId,
              userId,
            },
          },
          update: {
            ...normalizedWithCachedDetails,
            wearableConnectionId: connection.id,
            userId,
          },
          create: {
            ...normalizedWithCachedDetails,
            wearableConnectionId: connection.id,
            userId,
          },
        });

        // Existing activities from before split persistence (such as a report
        // re-previewed after deployment) need a one-time backfill too. The
        // report reads only this persisted payload and must never infer that a
        // missing payload means an activity has no splits.
        const cacheWasMissing = needsGarminActivitySplitBackfill(existing?.metrics);
        const splitCacheReady = !cacheWasMissing || await cacheGarminActivitySplits(activity);

        if (cacheWasMissing && !splitCacheReady) {
          logger.warn("Garmin split cache unavailable; post-activity report will wait for a later sync", {
            userId,
            activityId: activity.id,
            externalId: activity.externalId,
          });
        }

        syncedCount += 1;
        latestSyncedActivity = getLatestSyncedActivity(latestSyncedActivity, {
          externalId: normalized.externalId,
          startedAt: normalized.startedAt,
        });

        if (!existing) {
          createdCount += 1;
          latestRecentCreatedActivity = getLatestRecentCreatedActivity(
            latestRecentCreatedActivity,
            {
              id: activity.id,
              startedAt: normalized.startedAt,
            },
            {
              mode: postActivityReportMode,
              now: syncStartedAt,
              recentActivityReportWindowMs,
            },
          );
        }

        if (!existing && postActivityReportMode === "all-new" && splitCacheReady) {
          await enqueuePostActivityReport(activity.id);
        }
      }

      if (rawActivities.length < GARMIN_PAGE_SIZE) {
        break;
      }
    }

    if (latestRecentCreatedActivity && postActivityReportMode === "latest-recent-new") {
      const activity = await prisma.activity.findUnique({
        where: { id: latestRecentCreatedActivity.id },
        select: { metrics: true },
      });
      if (activity && !needsGarminActivitySplitBackfill(activity.metrics)) {
        await enqueuePostActivityReport(latestRecentCreatedActivity.id);
      }
    }

    const probeIntervalMs = await getGarminProbeIntervalMsForUser(userId);
    const syncCompletedAt = new Date();

    await prisma.wearableConnection.update({
      where: { id: connection.id },
      data: {
        status: "CONNECTED",
        lastSyncAt: syncCompletedAt,
        lastSyncStatus: `SYNCED_${syncedCount}`,
        lastErrorCode: null,
        lastProbeAt: syncCompletedAt,
        nextProbeAt: new Date(syncCompletedAt.getTime() + probeIntervalMs),
        lastSeenActivityExternalId: latestSyncedActivity?.externalId ?? connection.lastSeenActivityExternalId,
        lastProbeStatus: latestSyncedActivity ? "SYNC_BASELINE_UPDATED" : "NO_ACTIVITY",
        lastProbeErrorCode: null,
        lastProbeFailureCount: 0,
      },
    });

    return {
      syncedCount,
      createdCount,
      latestActivityExternalId: latestSyncedActivity?.externalId ?? null,
      postActivityReportQueued: Boolean(latestRecentCreatedActivity),
    };
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
  return [
    "GARMIN_SYNC_401",
    "GARMIN_SYNC_403",
    "GARMIN_SYNC_423",
    "GARMIN_VALIDATE_401",
    "GARMIN_VALIDATE_403",
    "GARMIN_VALIDATE_423",
    "GARMIN_ACTIVITY_401",
    "GARMIN_ACTIVITY_403",
    "GARMIN_ACTIVITY_423",
  ]
    .some((prefix) => errorCode.startsWith(prefix));
}

function resolvePostActivityReportMode(input?: {
  queuePostActivityReports?: boolean;
  postActivityReportMode?: PostActivityReportMode;
}) {
  if (input?.queuePostActivityReports === false) {
    return "none";
  }

  return input?.postActivityReportMode ?? "all-new";
}

function getLatestSyncedActivity(
  current: { externalId: string; startedAt: Date } | null,
  candidate: { externalId: string; startedAt: Date },
) {
  if (!current || candidate.startedAt > current.startedAt) {
    return candidate;
  }

  return current;
}

function getLatestRecentCreatedActivity(
  current: { id: string; startedAt: Date } | null,
  candidate: { id: string; startedAt: Date },
  input: {
    mode: PostActivityReportMode;
    now: Date;
    recentActivityReportWindowMs: number;
  },
) {
  if (
    input.mode !== "latest-recent-new"
    || !isRecentGarminActivityForReport({
      startedAt: candidate.startedAt,
      now: input.now,
      recentActivityReportWindowMs: input.recentActivityReportWindowMs,
    })
  ) {
    return current;
  }

  if (!current || candidate.startedAt > current.startedAt) {
    return candidate;
  }

  return current;
}

export function isRecentGarminActivityForReport(input: {
  startedAt: Date;
  now: Date;
  recentActivityReportWindowMs?: number;
}) {
  const windowMs = input.recentActivityReportWindowMs ?? GARMIN_RECENT_ACTIVITY_REPORT_WINDOW_MS;
  const ageMs = input.now.getTime() - input.startedAt.getTime();

  return ageMs >= 0 && ageMs <= windowMs;
}

async function getGarminProbeIntervalMsForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      whatsappIdentity: {
        select: {
          verifiedAt: true,
        },
      },
      notificationPreference: {
        select: {
          enabled: true,
          postActivityReport: true,
        },
      },
    },
  });

  return getGarminProbeIntervalMs({
    user: {
      whatsappIdentity: user?.whatsappIdentity ?? null,
      notificationPreference: user?.notificationPreference ?? null,
    },
  });
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

  const errorCode = reconnect.message ?? "GARMIN_RECONNECT_FAILED";

  if (isGarminAccountLockedErrorCode(errorCode)) {
    return {
      ok: false,
      errorCode,
      userMessage:
        "A Garmin informou que esta conta foi bloqueada. Recupere a senha no site da Garmin e depois conecte novamente no aplicativo.",
    };
  }

  return {
    ok: false,
    errorCode,
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
  const connection = await prisma.wearableConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: WearableProvider.GARMIN,
      },
    },
    select: {
      id: true,
    },
  });

  if (!connection) {
    return;
  }

  await sendGarminReconnectNotification({
    userId,
    connectionId: connection.id,
    errorCode,
    reason: "automatic",
  });
}

export async function sendGarminReconnectNotification(input: {
  userId: string;
  connectionId: string;
  errorCode?: string | null;
  reason: "automatic" | "admin";
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: {
      whatsappIdentity: true,
    },
  });

  if (!user?.whatsappIdentity?.verifiedAt) {
    return {
      sent: false,
      reason: "WHATSAPP_NOT_VERIFIED",
    };
  }

  try {
    const queued = await enqueueGarminReconnectReport({
      userId: input.userId,
      connectionId: input.connectionId,
      reason: input.reason,
    });

    const dispatchSummary = await dispatchPendingWhatsAppDeliveries({
      userId: input.userId,
      type: queued.type,
      maxMessages: 1,
    });

    const delivery = await prisma.messageDelivery.findUnique({
      where: {
        userId_type: {
          userId: input.userId,
          type: queued.type,
        },
      },
      select: {
        status: true,
      },
    });

    if (delivery?.status === "SENT" || delivery?.status === "DELIVERED") {
      return {
        sent: true,
        reason: "SENT",
      };
    }

    if (delivery?.status === "FAILED") {
      return {
        sent: false,
        reason: "SEND_FAILED",
      };
    }

    return {
      sent: false,
      reason: dispatchSummary.paused ? "DISPATCH_PAUSED" : queued.reason,
    };
  } catch (error) {
    logger.error("Failed to queue Garmin reconnect WhatsApp notification", {
      error,
      userId: input.userId,
      errorCode: input.errorCode,
      reason: input.reason,
    });

    await prisma.integrationEvent.create({
      data: {
        userId: input.userId,
        provider: "GARMIN",
        eventType: GARMIN_RECONNECT_NOTIFICATION_FAILED_EVENT,
        externalId: `${input.connectionId}:${Date.now()}`,
        payload: {
          reason: input.reason,
          errorCode: input.errorCode ?? null,
          message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        },
      },
    }).catch(() => undefined);

    return {
      sent: false,
      reason: "SEND_FAILED",
    };
  }
}

export async function getNextGarminSyncQueuePreview(input?: { limit?: number }) {
  const settings = await getStoredGarminReportingSettings();
  const limit = input?.limit ?? settings.maxProbesPerRun ?? DEFAULT_GARMIN_MAX_PROBES_PER_RUN;
  const now = new Date();
  const candidates = await getGarminProbeCandidates({
    now,
    take: limit,
  });

  return candidates
    .map((connection) => ({
      ...connection,
      nextSyncAt: connection.nextProbeAt ?? new Date(0),
    }))
    .sort(compareGarminProbePriority(now));
}

export async function syncAllGarminUsers(input?: {
  userId?: string;
  maxUsersPerRun?: number;
  maxProbesPerRun?: number;
  delayBetweenUserSyncSeconds?: number;
}): Promise<GarminSyncBatchResult> {
  const settings = await getStoredGarminReportingSettings();
  const maxUsersPerRun = input?.maxUsersPerRun ?? settings.maxUsersPerRun ?? DEFAULT_GARMIN_MAX_USERS_PER_RUN;
  const maxProbesPerRun = input?.maxProbesPerRun ?? settings.maxProbesPerRun ?? DEFAULT_GARMIN_MAX_PROBES_PER_RUN;
  const delayBetweenUserSyncSeconds = input?.delayBetweenUserSyncSeconds ?? settings.delayBetweenUserSyncSeconds ?? DEFAULT_GARMIN_SYNC_DELAY_SECONDS;
  const now = new Date();

  const [eligibleUsers, connections] = await Promise.all([
    countGarminProbeCandidates({
      userId: input?.userId,
      now,
    }),
    getGarminProbeCandidates({
      userId: input?.userId,
      now,
      take: maxProbesPerRun,
    }),
  ]);

  const syncResults: GarminSyncBatchResult["syncResults"] = [];

  for (const [index, connection] of connections.entries()) {
    let synced = false;

    try {
      if (!garminProvider.getLatestActivity) {
        throw new Error("GARMIN_LATEST_ACTIVITY_UNAVAILABLE");
      }

      const accountApiKey = await getSecret(connection.id, "GARMIN_API_KEY");

      if (!accountApiKey) {
        throw new Error("GARMIN_ACCOUNT_API_KEY_MISSING");
      }

      const latestActivity = await garminProvider.getLatestActivity({
        accountApiKey,
        fresh: true,
      });
      const latestActivityExternalId = getGarminActivityExternalIdForProbe(latestActivity);
      const changed = await shouldRunGarminSyncForLatestActivity({
        userId: connection.userId,
        lastSeenActivityExternalId: connection.lastSeenActivityExternalId,
        latestActivityExternalId,
      });

      if (changed) {
        const result = await syncGarminForUser(connection.userId);
        synced = true;

        await dispatchPendingWhatsAppDeliveries({
          userId: connection.userId,
          maxMessages: 1,
        });

        syncResults.push({
          userId: connection.userId,
          ok: true,
          syncedCount: result.syncedCount,
          latestActivityExternalId,
          changed: true,
        });
      } else {
        syncResults.push({
          userId: connection.userId,
          ok: true,
          syncedCount: 0,
          latestActivityExternalId,
          changed: false,
        });
      }

      const probeCompletedAt = new Date();

      await prisma.wearableConnection.update({
        where: { id: connection.id },
        data: {
          lastProbeAt: probeCompletedAt,
          nextProbeAt: getNextGarminProbeAt(connection, probeCompletedAt),
          lastSeenActivityExternalId: latestActivityExternalId,
          lastProbeStatus: changed ? "NEW_ACTIVITY_SYNCED" : latestActivityExternalId ? "UNCHANGED" : "NO_ACTIVITY",
          lastProbeErrorCode: null,
          lastProbeFailureCount: 0,
          status: "CONNECTED",
          lastErrorCode: null,
        },
      });
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "GARMIN_PROBE_FAILED";
      const failureCount = Math.min(
        GARMIN_PROBE_ERROR_BACKOFF_MS.length,
        (connection.lastProbeFailureCount ?? 0) + 1,
      );

      if (shouldAttemptGarminRevalidation(errorCode)) {
        const reconnectResult = await revalidateGarminConnection(connection.id);

        if (reconnectResult.ok) {
          const probeFailedAt = new Date();

          await prisma.wearableConnection.update({
            where: { id: connection.id },
            data: {
              lastProbeAt: probeFailedAt,
              nextProbeAt: getNextGarminProbeErrorAt(probeFailedAt, failureCount),
              lastProbeStatus: "REVALIDATED",
              lastProbeErrorCode: errorCode,
              lastProbeFailureCount: failureCount,
              lastSyncStatus: "REVALIDATED",
              lastErrorCode: null,
            },
          });
        } else {
          await markGarminReconnectRequired({
            connectionId: connection.id,
            userId: connection.userId,
            previousStatus: connection.status,
            errorCode: reconnectResult.errorCode,
          });
        }
      } else {
        const probeFailedAt = new Date();

        await prisma.wearableConnection.update({
          where: { id: connection.id },
          data: {
            status: "ERROR",
            lastProbeAt: probeFailedAt,
            nextProbeAt: getNextGarminProbeErrorAt(probeFailedAt, failureCount),
            lastProbeStatus: "FAILED",
            lastProbeErrorCode: errorCode,
            lastProbeFailureCount: failureCount,
            lastSyncStatus: "PROBE_FAILED",
            lastErrorCode: errorCode,
          },
        });
      }

      logger.error("Failed to probe Garmin user in batch", {
        error,
        userId: connection.userId,
      });
      syncResults.push({
        userId: connection.userId,
        ok: false,
        latestActivityExternalId: null,
        changed: false,
        error: errorCode,
      });
    }

    if (synced && index < connections.length - 1 && delayBetweenUserSyncSeconds > 0) {
      await wait(delayBetweenUserSyncSeconds * 1000);
    }
  }

  return {
    eligibleUsers,
    scannedUsers: connections.length,
    remainingUsers: Math.max(0, eligibleUsers - connections.length),
    syncedUsers: syncResults.filter((result) => result.ok && result.changed).length,
    failedUsers: syncResults.filter((result) => !result.ok).length,
    maxUsersPerRun,
    maxProbesPerRun,
    delayBetweenUserSyncSeconds,
    syncResults,
  };
}

type GarminProbeCandidate = Awaited<ReturnType<typeof getGarminProbeCandidates>>[number];

function getGarminProbeWhere(input: {
  userId?: string;
  now: Date;
}) {
  return {
    userId: input.userId,
    provider: WearableProvider.GARMIN,
    status: {
      in: [ConnectionStatus.CONNECTED, ConnectionStatus.SYNCING, ConnectionStatus.ERROR],
    },
    ...(input.userId
      ? {}
      : {
          OR: [
            { nextProbeAt: null },
            { nextProbeAt: { lte: input.now } },
          ],
        }),
  };
}

async function countGarminProbeCandidates(input: {
  userId?: string;
  now: Date;
}) {
  return prisma.wearableConnection.count({
    where: getGarminProbeWhere(input),
  });
}

async function getGarminProbeCandidates(input: {
  userId?: string;
  now: Date;
  take: number;
}) {
  return prisma.wearableConnection.findMany({
    where: getGarminProbeWhere(input),
    select: {
      id: true,
      userId: true,
      status: true,
      lastSyncAt: true,
      lastProbeAt: true,
      nextProbeAt: true,
      lastSeenActivityExternalId: true,
      lastProbeFailureCount: true,
      updatedAt: true,
      user: {
        select: {
          name: true,
          email: true,
          whatsappIdentity: {
            select: {
              verifiedAt: true,
            },
          },
          notificationPreference: {
            select: {
              enabled: true,
              postActivityReport: true,
            },
          },
        },
      },
    },
    orderBy: [{ nextProbeAt: "asc" }, { lastProbeAt: "asc" }, { updatedAt: "asc" }],
    take: input.take,
  });
}

export function getGarminActivityExternalIdForProbe(activity: unknown) {
  if (!activity || typeof activity !== "object" || Array.isArray(activity)) {
    return null;
  }

  const payload = activity as Record<string, unknown>;
  const candidates = [payload.activityId, payload.id, payload.externalId, payload.uuid];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null);

  return value === undefined || value === null ? null : String(value);
}

async function shouldRunGarminSyncForLatestActivity(input: {
  userId: string;
  lastSeenActivityExternalId: string | null;
  latestActivityExternalId: string | null;
}) {
  if (!input.latestActivityExternalId) {
    return false;
  }

  if (input.lastSeenActivityExternalId === input.latestActivityExternalId) {
    return false;
  }

  const existing = await prisma.activity.findUnique({
    where: {
      provider_externalId_userId: {
        provider: WearableProvider.GARMIN,
        externalId: input.latestActivityExternalId,
        userId: input.userId,
      },
    },
    select: {
      id: true,
    },
  });

  return shouldRunGarminSyncForProbe({
    latestActivityExternalId: input.latestActivityExternalId,
    lastSeenActivityExternalId: input.lastSeenActivityExternalId,
    activityAlreadyStored: Boolean(existing),
  });
}

export function shouldRunGarminSyncForProbe(input: {
  latestActivityExternalId: string | null;
  lastSeenActivityExternalId: string | null;
  activityAlreadyStored: boolean;
}) {
  return Boolean(
    input.latestActivityExternalId
      && input.lastSeenActivityExternalId !== input.latestActivityExternalId
      && !input.activityAlreadyStored,
  );
}

function getNextGarminProbeAt(connection: GarminProbeCandidate, now: Date) {
  return new Date(now.getTime() + getGarminProbeIntervalMs(connection));
}

export function getNextGarminProbeErrorAt(now: Date, failureCount: number) {
  const index = Math.max(0, Math.min(GARMIN_PROBE_ERROR_BACKOFF_MS.length - 1, failureCount - 1));
  return new Date(now.getTime() + GARMIN_PROBE_ERROR_BACKOFF_MS[index]);
}

export function getGarminProbeIntervalMs(connection: {
  user: {
    whatsappIdentity: { verifiedAt: Date | null } | null;
    notificationPreference: { enabled: boolean; postActivityReport: boolean } | null;
  };
}) {
  const fastReportEnabled = Boolean(
    connection.user.whatsappIdentity?.verifiedAt
      && connection.user.notificationPreference?.enabled
      && connection.user.notificationPreference.postActivityReport,
  );

  return fastReportEnabled ? GARMIN_FAST_PROBE_INTERVAL_MS : GARMIN_STANDARD_PROBE_INTERVAL_MS;
}

function compareGarminProbePriority(now: Date) {
  return (left: GarminProbeCandidate & { nextSyncAt: Date }, right: GarminProbeCandidate & { nextSyncAt: Date }) => {
    const leftOverdueMs = now.getTime() - left.nextSyncAt.getTime();
    const rightOverdueMs = now.getTime() - right.nextSyncAt.getTime();

    if (leftOverdueMs !== rightOverdueMs) {
      return rightOverdueMs - leftOverdueMs;
    }

    return (left.updatedAt?.getTime() ?? 0) - (right.updatedAt?.getTime() ?? 0);
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
