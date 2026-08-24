import { Channel, DeliveryStatus, WearableProvider } from "@prisma/client";

import { prisma } from "@/server/db";
import {
  DEFAULT_GARMIN_MESSAGE_DELAY_SECONDS,
  DEFAULT_GARMIN_MAX_MESSAGES_PER_DAY,
  DEFAULT_GARMIN_MAX_MESSAGES_PER_HOUR,
  DEFAULT_GARMIN_MAX_MESSAGES_PER_RUN,
  getStoredGarminReportingSettings,
} from "@/server/garmin-reporting-settings";
import { logger } from "@/server/logging/logger";
import { evolutionProvider } from "@/server/providers/messaging/evolution";
import { getGarminDailySnapshotForUser } from "@/server/services/garmin-daily-report";
import { buildDailyGarminSummaryReport, buildPostActivityReport } from "@/server/services/report-builder";

export const DEFAULT_DAILY_REPORT_TIME = "18:00";
export const DEFAULT_DAILY_REPORT_TIMEZONE = "UTC";

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

    if (!snapshot) {
      summary.skipped += 1;
      continue;
    }

    const queued = await ensurePendingDelivery(user.id, `DAILY_GARMIN_SUMMARY:${local.date}`);

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
      channel: Channel.WHATSAPP,
      provider: "EVOLUTION",
      status: DeliveryStatus.PENDING,
    },
  });

  const deliveries = allowedByBudget > 0
    ? await prisma.messageDelivery.findMany({
        where: {
          userId: input?.userId,
          channel: Channel.WHATSAPP,
          provider: "EVOLUTION",
          status: DeliveryStatus.PENDING,
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
    const materialized = await materializeDelivery(delivery.id);

    if (!materialized.ok) {
      await markDeliveryFailed(delivery.id, materialized.errorCode);
      summary.failed += 1;
    } else {
      try {
        const result = await evolutionProvider.sendText({
          to: materialized.phoneE164,
          text: materialized.text,
        });

        await prisma.messageDelivery.update({
          where: { id: delivery.id },
          data: {
            status: result.status === "sent" ? DeliveryStatus.SENT : DeliveryStatus.FAILED,
            externalMessageId: result.externalMessageId,
            sentAt: result.status === "sent" ? new Date() : null,
            failedAt: result.status === "failed" ? new Date() : null,
            errorCode: result.status === "failed" ? "EVOLUTION_SEND_FAILED" : null,
          },
        });

        if (result.status === "sent") {
          summary.sent += 1;
        } else {
          summary.failed += 1;
        }
      } catch (error) {
        logger.error("Failed to dispatch queued WhatsApp delivery", {
          error,
          deliveryId: delivery.id,
          type: delivery.type,
          userId: delivery.userId,
        });
        await markDeliveryFailed(delivery.id, "EVOLUTION_SEND_FAILED");
        summary.failed += 1;
      }
    }

    if (index < deliveries.length - 1 && delayBetweenMessagesSeconds > 0) {
      await wait(delayBetweenMessagesSeconds * 1000);
    }
  }

  return summary;
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

  if (!normalizedTime) {
    return {
      reportTime: DEFAULT_DAILY_REPORT_TIME,
      timezone: DEFAULT_DAILY_REPORT_TIMEZONE,
    };
  }

  return {
    reportTime: normalizedTime,
    timezone: normalizeTimezone(preference?.timezone),
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
}

async function materializeDelivery(deliveryId: string): Promise<
  | { ok: true; phoneE164: string; text: string }
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

  if (delivery.type.startsWith("POST_ACTIVITY_REPORT:")) {
    const activityId = delivery.type.slice("POST_ACTIVITY_REPORT:".length);
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

    return {
      ok: true,
      phoneE164: activity.user.whatsappIdentity.phoneE164,
      text: buildPostActivityReport({
        user: {
          name: activity.user.name,
          profile: activity.user.profile,
        },
        activity,
      }),
    };
  }

  if (delivery.type.startsWith("DAILY_GARMIN_SUMMARY:")) {
    const date = delivery.type.slice("DAILY_GARMIN_SUMMARY:".length);
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

    const snapshot = await getGarminDailySnapshotForUser(user.id, { date });

    if (!snapshot) {
      return { ok: false, errorCode: "GARMIN_DAILY_SNAPSHOT_UNAVAILABLE" };
    }

    return {
      ok: true,
      phoneE164: user.whatsappIdentity.phoneE164,
      text: buildDailyGarminSummaryReport({
        user: {
          name: user.name,
        },
        snapshot,
      }),
    };
  }

  return { ok: false, errorCode: "UNSUPPORTED_DELIVERY_TYPE" };
}

async function markDeliveryFailed(deliveryId: string, errorCode: string) {
  await prisma.messageDelivery.update({
    where: { id: deliveryId },
    data: {
      status: DeliveryStatus.FAILED,
      failedAt: new Date(),
      errorCode,
    },
  });
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
