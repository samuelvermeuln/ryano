import { randomUUID } from "node:crypto";

import { Channel, DeliveryStatus, Prisma, WearableProvider } from "@prisma/client";

import { generateReport } from "@/lib/reports/generate-report";
import { prisma } from "@/server/db";
import { getPublicAppUrl } from "@/server/env";
import {
  DEFAULT_GARMIN_MESSAGE_DELAY_SECONDS,
  DEFAULT_GARMIN_MAX_MESSAGES_PER_DAY,
  DEFAULT_GARMIN_MAX_MESSAGES_PER_HOUR,
  DEFAULT_GARMIN_MAX_MESSAGES_PER_RUN,
  getStoredGarminReportingSettings,
} from "@/server/garmin-reporting-settings";
import { logger } from "@/server/logging/logger";
import { evolutionProvider } from "@/server/providers/messaging/evolution";
import { isGarminAccountLockedErrorCode } from "@/server/services/garmin-connection-errors";
import { getGarminDailySnapshotForUser, hasGarminDailySummaryMetrics } from "@/server/services/garmin-daily-report";
import {
  GARMIN_RECONNECT_NOTIFICATION_FAILED_EVENT,
  GARMIN_RECONNECT_NOTIFICATION_SENT_EVENT,
} from "@/server/services/garmin-notification-events";
import {
  buildDailyGarminSummaryWhatsAppReport,
  buildGarminDailySyncCheckWhatsAppReport,
  buildGarminReconnectWhatsAppReport,
  buildPostActivityWhatsAppReport,
} from "@/server/services/report-builder";

export const DEFAULT_DAILY_REPORT_TIME = "18:00";
export const DEFAULT_DAILY_REPORT_TIMEZONE = "UTC";

const DAILY_GARMIN_SUMMARY_PREFIX = "DAILY_GARMIN_SUMMARY:";
const GARMIN_DAILY_SYNC_CHECK_PREFIX = "GARMIN_DAILY_SYNC_CHECK:";
const GARMIN_RECONNECT_ALERT_PREFIX = "GARMIN_RECONNECT_ALERT:";
const DELIVERY_LOCK_PREFIX = "LOCK:";
const DELIVERY_RESEND_SUFFIX = "::RESENT:";
const DELIVERY_LOCK_TTL_MS = 10 * 60 * 1000;
const GARMIN_ACCOUNT_RECOVERY_URL =
  process.env.NEXT_PUBLIC_GARMIN_RECOVER_PASSWORD_URL ||
  "https://sso.garmin.com/portal/sso/en-US/forgot-password?service=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F";

export async function enqueuePostActivityReport(activityId: string) {
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

  if (!activity?.user.whatsappIdentity?.verifiedAt || !activity.user.notificationPreference?.postActivityReport || !activity.user.notificationPreference.enabled) {
    return { queued: false, reason: "USER_NOT_ELIGIBLE" };
  }

  const type = `POST_ACTIVITY_REPORT:${activity.id}`;
  return ensurePendingDelivery(activity.userId, type);
}

export async function enqueueGarminReconnectReport(input: {
  userId: string;
  connectionId: string;
  reason: "automatic" | "admin";
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const cooldownWindow = Math.floor(now.getTime() / (5 * 60 * 1000));
  const type = `${GARMIN_RECONNECT_ALERT_PREFIX}${input.connectionId}:${input.reason}:${cooldownWindow}`;
  const queued = await ensurePendingDelivery(input.userId, type);

  return {
    ...queued,
    type,
  };
}

export async function enqueueDueDailyGarminSummaries(input?: { userId?: string; now?: Date }) {
  const now = input?.now ?? new Date();
  const users = await prisma.user.findMany({
    where: {
      id: input?.userId,
      whatsappIdentity: {
        is: {
          verifiedAt: {
            not: null,
          },
        },
      },
      notificationPreference: {
        is: {
          enabled: true,
          dailySummary: true,
        },
      },
      wearableConnections: {
        some: {
          provider: WearableProvider.GARMIN,
          status: {
            in: ["CONNECTED", "SYNCING", "ERROR"],
          },
        },
      },
    },
    select: {
      id: true,
      notificationPreference: {
        select: {
          reportTime: true,
          timezone: true,
        },
      },
    },
  });

  const summary = {
    scanned: users.length,
    due: 0,
    queued: 0,
    skipped: 0,
    syncCheckQueued: 0,
  };

  for (const user of users) {
    const schedule = getDailyReportSchedule(user.notificationPreference);
    const local = getDateTimeParts(now, schedule.timezone);

    if (toMinutes(local.time) < toMinutes(schedule.reportTime)) {
      summary.skipped += 1;
      continue;
    }

    summary.due += 1;

    const snapshot = await getGarminDailySnapshotForUser(user.id, { date: local.date });

    if (!snapshot || !hasGarminDailySummaryMetrics(snapshot)) {
      const queued = await ensurePendingGarminDailyDelivery(user.id, local.date, "sync-check");

      if (queued.queued) {
        summary.syncCheckQueued += 1;
      } else {
        summary.skipped += 1;
      }

      continue;
    }

    const queued = await ensurePendingGarminDailyDelivery(user.id, local.date, "summary");

    if (queued.queued) {
      summary.queued += 1;
    } else {
      summary.skipped += 1;
    }
  }

  return summary;
}

export async function dispatchPendingWhatsAppDeliveries(input?: {
  userId?: string;
  type?: string;
  maxMessages?: number;
  delayBetweenMessagesSeconds?: number;
  ignorePause?: boolean;
}) {
  const settings = await getStoredGarminReportingSettings();
  const now = new Date();

  if (settings.whatsappDispatchPaused && !input?.ignorePause) {
    const pendingCount = await prisma.messageDelivery.count({
      where: {
        userId: input?.userId,
        type: input?.type,
        channel: Channel.WHATSAPP,
        provider: "EVOLUTION",
        status: DeliveryStatus.PENDING,
      },
    });

    return {
      pending: pendingCount,
      scanned: 0,
      sent: 0,
      failed: 0,
      throttled: pendingCount,
      allowedByBudget: 0,
      maxMessages: 0,
      maxMessagesPerHour: settings.maxMessagesPerHour ?? DEFAULT_GARMIN_MAX_MESSAGES_PER_HOUR,
      maxMessagesPerDay: settings.maxMessagesPerDay ?? DEFAULT_GARMIN_MAX_MESSAGES_PER_DAY,
      sentLastHour: 0,
      sentLastDay: 0,
      paused: true,
    };
  }
  const maxMessages = input?.maxMessages ?? settings.maxMessagesPerRun ?? DEFAULT_GARMIN_MAX_MESSAGES_PER_RUN;
  const delayBetweenMessagesSeconds = input?.delayBetweenMessagesSeconds ?? settings.delayBetweenMessagesSeconds ?? DEFAULT_GARMIN_MESSAGE_DELAY_SECONDS;
  const maxMessagesPerHour = settings.maxMessagesPerHour ?? DEFAULT_GARMIN_MAX_MESSAGES_PER_HOUR;
  const maxMessagesPerDay = settings.maxMessagesPerDay ?? DEFAULT_GARMIN_MAX_MESSAGES_PER_DAY;

  const [sentLastHour, sentLastDay] = await Promise.all([
    prisma.messageDelivery.count({
      where: {
        userId: input?.userId,
        channel: Channel.WHATSAPP,
        provider: "EVOLUTION",
        status: {
          in: [DeliveryStatus.SENT, DeliveryStatus.DELIVERED],
        },
        sentAt: {
          gte: new Date(now.getTime() - 60 * 60 * 1000),
        },
      },
    }),
    prisma.messageDelivery.count({
      where: {
        userId: input?.userId,
        channel: Channel.WHATSAPP,
        provider: "EVOLUTION",
        status: {
          in: [DeliveryStatus.SENT, DeliveryStatus.DELIVERED],
        },
        sentAt: {
          gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  const availablePerHour = Math.max(0, maxMessagesPerHour - sentLastHour);
  const availablePerDay = Math.max(0, maxMessagesPerDay - sentLastDay);
  const allowedByBudget = Math.max(0, Math.min(maxMessages, availablePerHour, availablePerDay));

  const pendingCount = await prisma.messageDelivery.count({
    where: {
      userId: input?.userId,
      type: input?.type,
      channel: Channel.WHATSAPP,
      provider: "EVOLUTION",
      status: DeliveryStatus.PENDING,
    },
  });

  const lockCutoff = new Date(now.getTime() - DELIVERY_LOCK_TTL_MS);
  const deliveries = allowedByBudget > 0
    ? await prisma.messageDelivery.findMany({
        where: {
          userId: input?.userId,
          type: input?.type,
          channel: Channel.WHATSAPP,
          provider: "EVOLUTION",
          status: DeliveryStatus.PENDING,
          OR: [
            { externalMessageId: null },
            {
              externalMessageId: {
                startsWith: DELIVERY_LOCK_PREFIX,
              },
              updatedAt: {
                lt: lockCutoff,
              },
            },
          ],
        },
        orderBy: [{ createdAt: "asc" }],
        take: allowedByBudget,
      })
    : [];

  const summary = {
    pending: pendingCount,
    scanned: deliveries.length,
    sent: 0,
    failed: 0,
    throttled: Math.max(0, pendingCount - deliveries.length),
    allowedByBudget,
    maxMessages,
    maxMessagesPerHour,
    maxMessagesPerDay,
    sentLastHour,
    sentLastDay,
    paused: false,
  };

  for (const [index, delivery] of deliveries.entries()) {
    const result = await dispatchSpecificWhatsAppDelivery(delivery, { lockCutoff });

    if (!result.processed) {
      continue;
    }

    if (result.status === "sent") {
      summary.sent += 1;
    } else if (result.status === "failed") {
      summary.failed += 1;
    }

    if (index < deliveries.length - 1 && delayBetweenMessagesSeconds > 0) {
      await wait(delayBetweenMessagesSeconds * 1000);
    }
  }

  return summary;
}

async function dispatchSpecificWhatsAppDelivery(
  delivery: { id: string; userId: string; type: string },
  input: { lockCutoff: Date },
) {
  const reserved = await reservePendingDelivery(delivery.id, input.lockCutoff);

  if (!reserved) {
    return {
      processed: false,
      status: "skipped" as const,
      detail: null,
      debug: undefined,
    };
  }

  const materialized = await materializeDelivery(delivery.id);

  if (!materialized.ok) {
    const failureDetail = formatDeliveryFailureDetail(materialized.errorCode);

    await markDeliveryFailed(delivery.id, failureDetail);
    await recordWhatsAppDeliveryEvent({
      userId: delivery.userId,
      deliveryId: delivery.id,
      deliveryType: delivery.type,
      status: "failed",
      phoneE164: null,
      detail: failureDetail,
    });
    await recordGarminReconnectDeliveryEvent({
      deliveryType: delivery.type,
      userId: delivery.userId,
      status: "failed",
      sentTo: null,
      errorCode: failureDetail,
    });

    return {
      processed: true,
      status: "failed" as const,
      detail: failureDetail,
      debug: undefined,
    };
  }

  try {
    const result = materialized.kind === "image"
      ? await evolutionProvider.sendImage({
          to: materialized.phoneE164,
          image: materialized.image,
          caption: materialized.caption,
          fileName: materialized.fileName,
        })
      : await evolutionProvider.sendText({
          to: materialized.phoneE164,
          text: materialized.text,
        });

    const failureDetail = result.status === "failed"
      ? formatDeliveryFailureDetail(result.errorDetail ?? "EVOLUTION_SEND_FAILED")
      : null;

    await prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: result.status === "sent" ? DeliveryStatus.SENT : DeliveryStatus.FAILED,
        externalMessageId: result.status === "sent" ? result.externalMessageId : null,
        sentAt: result.status === "sent" ? new Date() : null,
        failedAt: result.status === "failed" ? new Date() : null,
        errorCode: failureDetail,
      },
    });

    await recordWhatsAppDeliveryEvent({
      userId: delivery.userId,
      deliveryId: delivery.id,
      deliveryType: delivery.type,
      status: result.status,
      phoneE164: materialized.phoneE164,
      detail: failureDetail,
      externalMessageId: result.externalMessageId ?? null,
      debug: result.debug,
    });
    await recordGarminReconnectDeliveryEvent({
      deliveryType: delivery.type,
      userId: delivery.userId,
      status: result.status,
      sentTo: materialized.phoneE164,
      errorCode: failureDetail,
    });

    return {
      processed: true,
      status: result.status,
      detail: failureDetail,
      debug: result.debug,
    };
  } catch (error) {
    logger.error("Failed to dispatch queued WhatsApp delivery", {
      error,
      deliveryId: delivery.id,
      type: delivery.type,
      userId: delivery.userId,
    });
    const failureDetail = formatDeliveryFailureDetail(error);
    await markDeliveryFailed(delivery.id, failureDetail);
    await recordWhatsAppDeliveryEvent({
      userId: delivery.userId,
      deliveryId: delivery.id,
      deliveryType: delivery.type,
      status: "failed",
      phoneE164: materialized.phoneE164,
      detail: failureDetail,
    });
    await recordGarminReconnectDeliveryEvent({
      deliveryType: delivery.type,
      userId: delivery.userId,
      status: "failed",
      sentTo: materialized.phoneE164,
      errorCode: failureDetail,
    });

    return {
      processed: true,
      status: "failed" as const,
      detail: failureDetail,
      debug: undefined,
    };
  }
}

export async function dispatchWhatsAppDeliveryById(deliveryId: string) {
  const delivery = await prisma.messageDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      userId: true,
      type: true,
      channel: true,
      provider: true,
      status: true,
    },
  });

  if (!delivery || delivery.channel !== Channel.WHATSAPP || delivery.provider !== "EVOLUTION") {
    return { ok: false, reason: "DELIVERY_NOT_FOUND" as const };
  }

  if (delivery.status === DeliveryStatus.SENT || delivery.status === DeliveryStatus.DELIVERED) {
    return { ok: false, reason: "DELIVERY_ALREADY_SENT" as const };
  }

  await prisma.messageDelivery.update({
    where: { id: delivery.id },
    data: {
      status: DeliveryStatus.PENDING,
      failedAt: null,
      errorCode: null,
      externalMessageId: null,
    },
  });

  const result = await dispatchSpecificWhatsAppDelivery({
    id: delivery.id,
    userId: delivery.userId,
    type: delivery.type,
  }, {
    lockCutoff: new Date(Date.now() - DELIVERY_LOCK_TTL_MS),
  });

  if (!result.processed) {
    return { ok: false, reason: "DELIVERY_LOCKED" as const };
  }

  return {
    ok: true,
    reason: result.status === "sent" ? "SENT" as const : "FAILED" as const,
    detail: result.detail,
    debug: result.debug,
  };
}

export async function redeliverWhatsAppDeliveryById(deliveryId: string, input?: { dispatchNow?: boolean }) {
  const delivery = await prisma.messageDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      userId: true,
      type: true,
      channel: true,
      provider: true,
      status: true,
    },
  });

  if (!delivery || delivery.channel !== Channel.WHATSAPP || delivery.provider !== "EVOLUTION") {
    return { ok: false, reason: "DELIVERY_NOT_FOUND" as const };
  }

  if (delivery.status === DeliveryStatus.PENDING) {
    return { ok: false, reason: "DELIVERY_ALREADY_PENDING" as const };
  }

  const canonicalType = getCanonicalDeliveryType(delivery.type);
  const now = new Date();

  const recreated = await prisma.$transaction(async (tx) => {
    const activeCanonical = await tx.messageDelivery.findUnique({
      where: {
        userId_type: {
          userId: delivery.userId,
          type: canonicalType,
        },
      },
      select: {
        id: true,
        type: true,
      },
    });

    if (activeCanonical) {
      await tx.messageDelivery.update({
        where: { id: activeCanonical.id },
        data: {
          type: buildResentDeliveryType(canonicalType, now, activeCanonical.id),
        },
      });
    }

    return tx.messageDelivery.create({
      data: {
        userId: delivery.userId,
        channel: Channel.WHATSAPP,
        type: canonicalType,
        provider: "EVOLUTION",
        status: DeliveryStatus.PENDING,
      },
      select: {
        id: true,
        userId: true,
        type: true,
      },
    });
  });

  if (!input?.dispatchNow) {
    return {
      ok: true,
      reason: "REQUEUED_UPDATED" as const,
      deliveryId: recreated.id,
    };
  }

  const result = await dispatchSpecificWhatsAppDelivery(recreated, {
    lockCutoff: new Date(Date.now() - DELIVERY_LOCK_TTL_MS),
  });

  if (!result.processed) {
    return {
      ok: false,
      reason: "DELIVERY_LOCKED" as const,
      deliveryId: recreated.id,
    };
  }

  return {
    ok: true,
    reason: result.status === "sent" ? "SENT" as const : "FAILED" as const,
    detail: result.detail,
    debug: result.debug,
    deliveryId: recreated.id,
  };
}

export async function requeueMessageDeliveryById(deliveryId: string) {
  const delivery = await prisma.messageDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      channel: true,
      provider: true,
      status: true,
      type: true,
    },
  });

  if (!delivery || delivery.channel !== Channel.WHATSAPP || delivery.provider !== "EVOLUTION") {
    return { updated: false, reason: "DELIVERY_NOT_FOUND" };
  }

  if (delivery.status === DeliveryStatus.SENT || delivery.status === DeliveryStatus.DELIVERED) {
    return { updated: false, reason: "DELIVERY_ALREADY_SENT" };
  }

  if (delivery.status === DeliveryStatus.PENDING) {
    return { updated: false, reason: "DELIVERY_ALREADY_PENDING" };
  }

  await prisma.messageDelivery.update({
    where: { id: delivery.id },
    data: {
      status: DeliveryStatus.PENDING,
      failedAt: null,
      errorCode: null,
      externalMessageId: null,
    },
  });

  return { updated: true, reason: "REQUEUED" };
}

export async function requeueFailedWhatsAppDeliveries(input?: { limit?: number }) {
  const failed = await prisma.messageDelivery.findMany({
    where: {
      channel: Channel.WHATSAPP,
      provider: "EVOLUTION",
      status: DeliveryStatus.FAILED,
    },
    orderBy: [{ updatedAt: "asc" }],
    take: input?.limit ?? 50,
    select: {
      id: true,
    },
  });

  if (!failed.length) {
    return { scanned: 0, requeued: 0 };
  }

  const result = await prisma.messageDelivery.updateMany({
    where: {
      id: {
        in: failed.map((delivery) => delivery.id),
      },
    },
    data: {
      status: DeliveryStatus.PENDING,
      failedAt: null,
      errorCode: null,
      externalMessageId: null,
    },
  });

  return {
    scanned: failed.length,
    requeued: result.count,
  };
}

export function getDailyReportSchedule(preference?: {
  reportTime: string | null;
  timezone: string | null;
} | null) {
  const normalizedTime = normalizeReportTime(preference?.reportTime);

  return {
    reportTime: normalizedTime ?? DEFAULT_DAILY_REPORT_TIME,
    timezone: DEFAULT_DAILY_REPORT_TIMEZONE,
  };
}

export function normalizeReportTime(value: FormDataEntryValue | string | null | undefined) {
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeTimezone(value: string | null | undefined) {
  const raw = value?.trim();

  if (!raw) {
    return DEFAULT_DAILY_REPORT_TIMEZONE;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return DEFAULT_DAILY_REPORT_TIMEZONE;
  }
}

function getGarminDailyDeliveryType(date: string, variant: "summary" | "sync-check") {
  return `${variant === "summary" ? DAILY_GARMIN_SUMMARY_PREFIX : GARMIN_DAILY_SYNC_CHECK_PREFIX}${date}`;
}

async function ensurePendingGarminDailyDelivery(userId: string, date: string, variant: "summary" | "sync-check") {
  const targetType = getGarminDailyDeliveryType(date, variant);
  const alternateType = getGarminDailyDeliveryType(date, variant === "summary" ? "sync-check" : "summary");
  const existing = await prisma.messageDelivery.findMany({
    where: {
      userId,
      type: {
        in: [targetType, alternateType],
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const targetDelivery = existing.find((delivery) => delivery.type === targetType) ?? null;
  const alternateDelivery = existing.find((delivery) => delivery.type === alternateType) ?? null;

  if (targetDelivery?.status === DeliveryStatus.SENT || targetDelivery?.status === DeliveryStatus.DELIVERED) {
    return { queued: false, reason: "ALREADY_SENT" };
  }

  if (targetDelivery?.status === DeliveryStatus.PENDING) {
    return { queued: false, reason: "ALREADY_PENDING" };
  }

  if (alternateDelivery?.status === DeliveryStatus.SENT || alternateDelivery?.status === DeliveryStatus.DELIVERED) {
    if (variant === "summary") {
      return ensurePendingDelivery(userId, targetType);
    }

    return { queued: false, reason: "ALREADY_SENT_OTHER_VARIANT" };
  }

  if (alternateDelivery && variant === "summary") {
    await prisma.messageDelivery.update({
      where: { id: alternateDelivery.id },
      data: {
        type: targetType,
        status: DeliveryStatus.PENDING,
        sentAt: null,
        deliveredAt: null,
        failedAt: null,
        errorCode: null,
        externalMessageId: null,
      },
    });

    return { queued: true, reason: "REPLACED_SYNC_CHECK" };
  }

  if (alternateDelivery) {
    return { queued: false, reason: "OTHER_VARIANT_EXISTS" };
  }

  return ensurePendingDelivery(userId, targetType);
}

async function ensurePendingDelivery(userId: string, type: string) {
  const existingDelivery = await prisma.messageDelivery.findUnique({
    where: {
      userId_type: {
        userId,
        type,
      },
    },
  });

  if (existingDelivery?.status === DeliveryStatus.SENT || existingDelivery?.status === DeliveryStatus.DELIVERED) {
    return { queued: false, reason: "ALREADY_SENT" };
  }

  if (existingDelivery?.status === DeliveryStatus.PENDING) {
    return { queued: false, reason: "ALREADY_PENDING" };
  }

  if (existingDelivery) {
    await prisma.messageDelivery.update({
      where: { id: existingDelivery.id },
      data: {
        status: DeliveryStatus.PENDING,
        failedAt: null,
        errorCode: null,
        externalMessageId: null,
      },
    });

    return { queued: true, reason: "REQUEUED" };
  }

  try {
    await prisma.messageDelivery.create({
      data: {
        userId,
        channel: Channel.WHATSAPP,
        type,
        provider: "EVOLUTION",
        status: DeliveryStatus.PENDING,
      },
    });

    return { queued: true, reason: "CREATED" };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { queued: false, reason: "ALREADY_QUEUED" };
    }

    throw error;
  }
}

async function materializeDelivery(deliveryId: string): Promise<
  | { ok: true; kind: "text"; phoneE164: string; text: string }
  | { ok: true; kind: "image"; phoneE164: string; image: Buffer; caption?: string; fileName?: string }
  | { ok: false; errorCode: string }
> {
  const delivery = await prisma.messageDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      userId: true,
      type: true,
    },
  });

  if (!delivery) {
    return { ok: false, errorCode: "DELIVERY_NOT_FOUND" };
  }

  const canonicalType = getCanonicalDeliveryType(delivery.type);

  if (canonicalType.startsWith("POST_ACTIVITY_REPORT:")) {
    const activityId = canonicalType.slice("POST_ACTIVITY_REPORT:".length);
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

    if (!activity?.user.whatsappIdentity?.verifiedAt || !activity.user.notificationPreference?.postActivityReport || !activity.user.notificationPreference.enabled) {
      return { ok: false, errorCode: "POST_ACTIVITY_NOT_ELIGIBLE" };
    }

    const report = buildPostActivityWhatsAppReport({
      user: {
        name: activity.user.name,
        image: activity.user.image,
      },
      activity,
    });

    return {
      ok: true,
      kind: "image",
      phoneE164: activity.user.whatsappIdentity.phoneE164,
      image: await generateReport(report.request),
      caption: report.caption,
      fileName: report.fileName,
    };
  }

  if (canonicalType.startsWith(DAILY_GARMIN_SUMMARY_PREFIX) || canonicalType.startsWith(GARMIN_DAILY_SYNC_CHECK_PREFIX)) {
    const prefix = canonicalType.startsWith(DAILY_GARMIN_SUMMARY_PREFIX)
      ? DAILY_GARMIN_SUMMARY_PREFIX
      : GARMIN_DAILY_SYNC_CHECK_PREFIX;
    const date = canonicalType.slice(prefix.length);
    const user = await prisma.user.findUnique({
      where: { id: delivery.userId },
      include: {
        whatsappIdentity: true,
        notificationPreference: true,
      },
    });

    if (!user?.whatsappIdentity?.verifiedAt || !user.notificationPreference?.dailySummary || !user.notificationPreference.enabled) {
      return { ok: false, errorCode: "DAILY_SUMMARY_NOT_ELIGIBLE" };
    }

    if (prefix === GARMIN_DAILY_SYNC_CHECK_PREFIX) {
      const snapshot = await getGarminDailySnapshotForUser(user.id, { date });

      if (hasGarminDailySummaryMetrics(snapshot)) {
        return { ok: false, errorCode: "GARMIN_DAILY_SYNC_CHECK_NOT_NEEDED" };
      }

      const report = buildGarminDailySyncCheckWhatsAppReport({
        user: {
          name: user.name,
          image: user.image,
        },
        date,
      });

      return {
        ok: true,
        kind: "image",
        phoneE164: user.whatsappIdentity.phoneE164,
        image: await generateReport(report.request),
        caption: report.caption,
        fileName: report.fileName,
      };
    }

    const snapshot = await getGarminDailySnapshotForUser(user.id, { date });

    if (!hasGarminDailySummaryMetrics(snapshot)) {
      return { ok: false, errorCode: "GARMIN_DAILY_SNAPSHOT_UNAVAILABLE" };
    }

    const report = buildDailyGarminSummaryWhatsAppReport({
      user: {
        name: user.name,
        image: user.image,
      },
      snapshot,
    });

    return {
      ok: true,
      kind: "image",
      phoneE164: user.whatsappIdentity.phoneE164,
      image: await generateReport(report.request),
      caption: report.caption,
      fileName: report.fileName,
    };
  }

  if (canonicalType.startsWith(GARMIN_RECONNECT_ALERT_PREFIX)) {
    const { connectionId } = parseGarminReconnectDeliveryType(canonicalType);
    const connection = await prisma.wearableConnection.findUnique({
      where: { id: connectionId },
      include: {
        user: {
          include: {
            whatsappIdentity: true,
          },
        },
      },
    });

    if (!connection?.user.whatsappIdentity?.verifiedAt) {
      return { ok: false, errorCode: "GARMIN_RECONNECT_NOT_ELIGIBLE" };
    }

    const revalidateUrl = new URL("/app/integracoes?garmin=revalidar", getPublicAppUrl()).toString();
    const reconnectUrl = isGarminAccountLockedErrorCode(connection.lastErrorCode) ? GARMIN_ACCOUNT_RECOVERY_URL : revalidateUrl;
    const report = buildGarminReconnectWhatsAppReport({
      user: {
        name: connection.user.name,
        image: connection.user.image,
      },
      reconnectUrl,
      errorCode: connection.lastErrorCode,
    });

    return {
      ok: true,
      kind: "image",
      phoneE164: connection.user.whatsappIdentity.phoneE164,
      image: await generateReport(report.request),
      caption: report.caption,
      fileName: report.fileName,
    };
  }

  return { ok: false, errorCode: "UNSUPPORTED_DELIVERY_TYPE" };
}

async function reservePendingDelivery(deliveryId: string, lockCutoff: Date) {
  const result = await prisma.messageDelivery.updateMany({
    where: {
      id: deliveryId,
      status: DeliveryStatus.PENDING,
      OR: [
        { externalMessageId: null },
        {
          externalMessageId: {
            startsWith: DELIVERY_LOCK_PREFIX,
          },
          updatedAt: {
            lt: lockCutoff,
          },
        },
      ],
    },
    data: {
      externalMessageId: `${DELIVERY_LOCK_PREFIX}${randomUUID()}`,
    },
  });

  return result.count === 1;
}

async function markDeliveryFailed(deliveryId: string, errorCode: string) {
  await prisma.messageDelivery.update({
    where: { id: deliveryId },
    data: {
      status: DeliveryStatus.FAILED,
      failedAt: new Date(),
      errorCode,
      externalMessageId: null,
    },
  });
}

function formatDeliveryFailureDetail(error: unknown) {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error === null || error === undefined
        ? "UNKNOWN_ERROR"
        : JSON.stringify(error);
  const normalized = raw.replace(/\s+/g, " ").trim();

  return normalized.length > 280 ? `${normalized.slice(0, 277)}...` : normalized;
}

async function recordWhatsAppDeliveryEvent(input: {
  userId: string;
  deliveryId: string;
  deliveryType: string;
  status: "sent" | "failed";
  phoneE164: string | null;
  detail: string | null;
  externalMessageId?: string | null;
  debug?: {
    mode: "text" | "image";
    endpoint: string;
    variant?: string | null;
    attempts?: string[];
  };
}) {
  await prisma.integrationEvent.create({
    data: {
      userId: input.userId,
      provider: "EVOLUTION",
      eventType: input.status === "sent" ? "WHATSAPP_DELIVERY_SENT" : "WHATSAPP_DELIVERY_FAILED",
      externalId: `${input.deliveryId}:${Date.now()}`,
      payload: {
        deliveryId: input.deliveryId,
        deliveryType: input.deliveryType,
        phoneE164: input.phoneE164,
        detail: input.detail,
        externalMessageId: input.externalMessageId ?? null,
        transportMode: input.debug?.mode ?? null,
        endpoint: input.debug?.endpoint ?? null,
        variant: input.debug?.variant ?? null,
        attempts: input.debug?.attempts ?? [],
      },
    },
  }).catch(() => undefined);
}

function getCanonicalDeliveryType(type: string) {
  const markerIndex = type.indexOf(DELIVERY_RESEND_SUFFIX);

  if (markerIndex === -1) {
    return type;
  }

  return type.slice(0, markerIndex);
}

function buildResentDeliveryType(type: string, timestamp: Date, deliveryId: string) {
  return `${getCanonicalDeliveryType(type)}${DELIVERY_RESEND_SUFFIX}${timestamp.toISOString()}:${deliveryId}`;
}

function parseGarminReconnectDeliveryType(type: string) {
  const [prefix, connectionId, reason] = type.split(":");

  if (`${prefix}:` !== GARMIN_RECONNECT_ALERT_PREFIX || !connectionId || (reason !== "automatic" && reason !== "admin")) {
    throw new Error("GARMIN_RECONNECT_DELIVERY_TYPE_INVALID");
  }

  return {
    connectionId,
    reason,
  } as const;
}

async function recordGarminReconnectDeliveryEvent(input: {
  deliveryType: string;
  userId: string;
  status: "sent" | "failed";
  sentTo: string | null;
  errorCode: string | null;
}) {
  if (!input.deliveryType.startsWith(GARMIN_RECONNECT_ALERT_PREFIX)) {
    return;
  }

  const { connectionId, reason } = parseGarminReconnectDeliveryType(input.deliveryType);
  const connection = await prisma.wearableConnection.findUnique({
    where: { id: connectionId },
    select: {
      lastErrorCode: true,
    },
  });
  const revalidateUrl = new URL("/app/integracoes?garmin=revalidar", getPublicAppUrl()).toString();
  const reconnectUrl = isGarminAccountLockedErrorCode(connection?.lastErrorCode) ? GARMIN_ACCOUNT_RECOVERY_URL : revalidateUrl;

  await prisma.integrationEvent.create({
    data: {
      userId: input.userId,
      provider: "GARMIN",
      eventType: input.status === "sent"
        ? GARMIN_RECONNECT_NOTIFICATION_SENT_EVENT
        : GARMIN_RECONNECT_NOTIFICATION_FAILED_EVENT,
      externalId: `${connectionId}:${Date.now()}`,
      payload: {
        reason,
        errorCode: connection?.lastErrorCode ?? input.errorCode,
        sentTo: input.sentTo,
        evolutionStatus: input.status,
        reconnectUrl,
        message: input.status === "failed" ? input.errorCode : null,
      },
    },
  }).catch(() => undefined);
}

function getDateTimeParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
