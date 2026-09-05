/**
 * Camada genérica (provider-agnostic) de fila e entrega de relatórios via
 * WhatsApp.
 *
 * TAREFA 2.4 — Ciclo de dependência quebrado. Este arquivo NÃO importa mais nada
 * de `modules/garmin/**`: toda a lógica específica de provider (materialização
 * de relatórios diários/reconexão/pós-atividade, registro de eventos de
 * reconexão e configurações de throttle) foi movida para
 * `modules/garmin/application/reporting` e é injetada aqui via o registro
 * genérico em `@/modules/shared/reports/delivery`.
 *
 * A engine expõe as funções genéricas de enfileiramento/despacho/requeue e o
 * `ensurePendingDelivery`/helpers de agenda usados pelos enfileiradores
 * específicos de cada provider. Os módulos de provider dependem apenas desta
 * camada (uma direção), eliminando o ciclo Garmin ↔ reporting.
 *
 * _Requisitos: 5.1, 5.2, 9.6_
 */

import { randomUUID } from "node:crypto";

import { Channel, DeliveryStatus, Prisma } from "@prisma/client";

import {
  getDeliveryDispatchHooks,
  getWhatsAppDispatchSettings,
  resolveDeliveryMaterializer,
  type DeliveryDispatchOutcome,
  type MaterializedDelivery,
} from "@/modules/shared/reports/delivery";
import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";
import { evolutionProvider } from "@/server/providers/messaging/evolution";

export const DEFAULT_DAILY_REPORT_TIME = "18:00";
export const DEFAULT_DAILY_REPORT_TIMEZONE = "UTC";

const DELIVERY_LOCK_PREFIX = "LOCK:";
const DELIVERY_RESEND_SUFFIX = "::RESENT:";
const DELIVERY_LOCK_TTL_MS = 10 * 60 * 1000;

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

export async function dispatchPendingWhatsAppDeliveries(input?: {
  userId?: string;
  type?: string;
  maxMessages?: number;
  delayBetweenMessagesSeconds?: number;
  ignorePause?: boolean;
}) {
  const settings = await getWhatsAppDispatchSettings();
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
      maxMessagesPerHour: settings.maxMessagesPerHour,
      maxMessagesPerDay: settings.maxMessagesPerDay,
      sentLastHour: 0,
      sentLastDay: 0,
      paused: true,
    };
  }
  const maxMessages = input?.maxMessages ?? settings.maxMessagesPerRun;
  const delayBetweenMessagesSeconds = input?.delayBetweenMessagesSeconds ?? settings.delayBetweenMessagesSeconds;
  const maxMessagesPerHour = settings.maxMessagesPerHour;
  const maxMessagesPerDay = settings.maxMessagesPerDay;

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

async function runDeliveryDispatchHooks(outcome: DeliveryDispatchOutcome) {
  for (const hook of getDeliveryDispatchHooks()) {
    await hook(outcome);
  }
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
    await runDeliveryDispatchHooks({
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
    await runDeliveryDispatchHooks({
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
    await runDeliveryDispatchHooks({
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

/**
 * Enfileira (ou reativa) uma entrega pendente para um tipo. Genérico: usado
 * tanto pela camada compartilhada quanto pelos enfileiradores específicos de
 * cada provider (ex.: Garmin) para reaproveitar o mesmo comportamento de
 * idempotência/requeue.
 */
export async function ensurePendingDelivery(userId: string, type: string) {
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

export async function materializeDelivery(deliveryId: string): Promise<MaterializedDelivery> {
  try {
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
    const materializer = resolveDeliveryMaterializer(canonicalType);

    if (!materializer) {
      return { ok: false, errorCode: "UNSUPPORTED_DELIVERY_TYPE" };
    }

    return await materializer({
      deliveryId: delivery.id,
      userId: delivery.userId,
      canonicalType,
    });
  } catch (error) {
    return { ok: false, errorCode: formatDeliveryFailureDetail(error) };
  }
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

export function getCanonicalDeliveryType(type: string) {
  const markerIndex = type.indexOf(DELIVERY_RESEND_SUFFIX);

  if (markerIndex === -1) {
    return type;
  }

  return type.slice(0, markerIndex);
}

function buildResentDeliveryType(type: string, timestamp: Date, deliveryId: string) {
  return `${getCanonicalDeliveryType(type)}${DELIVERY_RESEND_SUFFIX}${timestamp.toISOString()}:${deliveryId}`;
}

export function getDateTimeParts(date: Date, timezone: string) {
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

export function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
