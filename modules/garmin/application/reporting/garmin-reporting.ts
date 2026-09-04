/**
 * Camada de relatórios específica do Garmin.
 *
 * TAREFA 2.4 — Quebra do ciclo Garmin ↔ reporting. Toda a lógica de relatório
 * específica do Garmin (materialização de resumo diário, sync-check, reconexão e
 * pós-atividade; enfileiramento de reconexão e de resumos diários; registro de
 * eventos de reconexão; e as configurações de throttle do despacho) vive aqui,
 * dentro do módulo Garmin.
 *
 * Este módulo depende apenas da camada genérica compartilhada
 * (`@/modules/shared/reports/delivery` para o registro, e
 * `@/server/services/reporting` para o plumbing genérico de fila/agenda) — uma
 * única direção. A camada genérica NÃO importa nada do Garmin.
 *
 * IMPORTANTE — efeito colateral de registro: importar este módulo registra os
 * materializadores/hook/configurações no registro compartilhado. O registro é
 * garantido em todos os caminhos que despacham entregas porque esses caminhos
 * também importam o módulo Garmin:
 *   - `garmin-service.ts` importa `enqueueGarminReconnectReport` daqui;
 *   - as rotas/actions que chamam `dispatchPendingWhatsAppDeliveries` também
 *     importam `syncAllGarminUsers`/`connectGarminForUser` (garmin-service) ou
 *     `enqueueDueDailyGarminSummaries` (este módulo);
 * portanto o registro sempre é acionado antes de qualquer despacho.
 *
 * _Requisitos: 5.1, 5.2, 9.6_
 */

import { DeliveryStatus, SecretType, WearableProvider } from "@prisma/client";

import { generateReport } from "@/lib/reports/generate-report";
import { garminProvider } from "@/modules/garmin/infrastructure/provider";
import { getStoredGarminReportingSettings } from "@/modules/garmin/config";
import { getGarminDailySnapshotForUser, hasGarminDailySummaryMetrics } from "@/modules/garmin/application/daily";
import { getGarminActivityVisualData } from "@/modules/garmin/application/activities/garmin-activity-details";
import { isGarminAccountLockedErrorCode } from "@/modules/garmin/domain/errors";
import { getDailyGarminDeliveryDecision } from "@/modules/garmin/application/reporting/daily-summary-scheduling";
import {
  GARMIN_RECONNECT_NOTIFICATION_FAILED_EVENT,
  GARMIN_RECONNECT_NOTIFICATION_SENT_EVENT,
} from "@/modules/garmin/domain/events";
import {
  GENERIC_DELIVERY_PREFIXES,
  registerDeliveryDispatchHook,
  registerDeliveryMaterializer,
  registerWhatsAppDispatchSettingsProvider,
  type MaterializedDelivery,
} from "@/modules/shared/reports/delivery";
import { prisma } from "@/server/db";
import { decryptSecret } from "@/server/crypto/secret-vault";
import { getPublicAppUrl } from "@/server/env";
import {
  buildDailyGarminSummaryWhatsAppReport,
  buildGarminReconnectWhatsAppReport,
  buildPostActivityWhatsAppReport,
} from "@/server/services/report-builder";
import {
  ensurePendingDelivery,
  getDailyReportSchedule,
  getDateTimeParts,
  toMinutes,
} from "@/server/services/reporting";
import { buildGarminMultisportLegs, buildPersistedGarminPostActivitySplits } from "./garmin-multisport-legs";

// Prefixos LEGADOS (provider-específicos). Mantidos como constantes para
// enfileirar/parsear os `MessageDelivery` já existentes sem quebra de
// comportamento. Continuam sendo aceitos pelo resolver como aliases dos
// prefixos genéricos (Requisito 9.6).
const POST_ACTIVITY_REPORT_PREFIX = GENERIC_DELIVERY_PREFIXES.postActivity;
const DAILY_GARMIN_SUMMARY_PREFIX = "DAILY_GARMIN_SUMMARY:";
const GARMIN_DAILY_SYNC_CHECK_PREFIX = "GARMIN_DAILY_SYNC_CHECK:";
const GARMIN_RECONNECT_ALERT_PREFIX = "GARMIN_RECONNECT_ALERT:";

// Prefixos genéricos (provider-agnostic) equivalentes, usados como chave
// canônica de registro do materializador (Requisito 9.6).
const GENERIC_DAILY_SUMMARY_PREFIX = GENERIC_DELIVERY_PREFIXES.dailySummary;
const GENERIC_DAILY_SYNC_CHECK_PREFIX = GENERIC_DELIVERY_PREFIXES.syncCheck;
const GENERIC_RECONNECT_ALERT_PREFIX = GENERIC_DELIVERY_PREFIXES.reconnect;

// Todos os prefixos aceitos por variante (legado + genérico), para tornar a
// materialização/parse robusta a ambos os nomes.
const DAILY_SUMMARY_PREFIXES = [DAILY_GARMIN_SUMMARY_PREFIX, GENERIC_DAILY_SUMMARY_PREFIX] as const;
const DAILY_SYNC_CHECK_PREFIXES = [GARMIN_DAILY_SYNC_CHECK_PREFIX, GENERIC_DAILY_SYNC_CHECK_PREFIX] as const;
const RECONNECT_ALERT_PREFIXES = [GARMIN_RECONNECT_ALERT_PREFIX, GENERIC_RECONNECT_ALERT_PREFIX] as const;

/**
 * Determina a variante (resumo x aviso de sincronização) e a data de um tipo de
 * entrega diário, aceitando tanto o prefixo legado quanto o genérico.
 */
function parseGarminDailyDeliveryType(
  canonicalType: string,
): { variant: "summary" | "sync-check"; date: string } | null {
  for (const prefix of DAILY_SUMMARY_PREFIXES) {
    if (canonicalType.startsWith(prefix)) {
      return { variant: "summary", date: canonicalType.slice(prefix.length) };
    }
  }

  for (const prefix of DAILY_SYNC_CHECK_PREFIXES) {
    if (canonicalType.startsWith(prefix)) {
      return { variant: "sync-check", date: canonicalType.slice(prefix.length) };
    }
  }

  return null;
}
const GARMIN_ACCOUNT_RECOVERY_URL =
  process.env.NEXT_PUBLIC_GARMIN_RECOVER_PASSWORD_URL ||
  "https://sso.garmin.com/portal/sso/en-US/forgot-password?service=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F";

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
    waitingForMetrics: 0,
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

    const decision = getDailyGarminDeliveryDecision(
      Boolean(snapshot && hasGarminDailySummaryMetrics(snapshot)),
    );
    if (decision.action === "wait") {
      summary.waitingForMetrics += 1;
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

async function materializePostActivityReport(canonicalType: string): Promise<MaterializedDelivery> {
  const activityId = canonicalType.slice(POST_ACTIVITY_REPORT_PREFIX.length);
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

  const multisportLegs = await loadGarminMultisportLegs(activity);
  const postActivitySplits = await getGarminPostActivitySplits(activity);
  if (["triathlon", "duathlon", "aquathlon", "multisport"].includes(activity.sportType) && multisportLegs.length < 2) {
    return { ok: false, errorCode: "POST_ACTIVITY_MULTISPORT_LEGS_UNAVAILABLE" };
  }

  const visualData = await getGarminActivityVisualData(activity);
  const heartRateZones = visualData?.barSections.find((section) => section.id === "heart-rate-zones")?.items.map((zone) => ({
    label: zone.label,
    value: zone.valueText.split(" · ")[0] ?? zone.valueText,
    ratio: zone.ratio,
    color: zone.color.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#94A3B8",
  }));

  const report = buildPostActivityWhatsAppReport({
    user: {
      name: activity.user.name,
      image: activity.user.image,
    },
    activity,
    multisportLegs,
    ...postActivitySplits,
    heartRateZones,
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

export async function getGarminPostActivitySplits(activity: {
  provider: WearableProvider;
  sportType: string;
  metrics: unknown;
}) {
  if (activity.provider !== WearableProvider.GARMIN || ["triathlon", "duathlon", "aquathlon", "multisport"].includes(activity.sportType)) {
    return {};
  }

  const splitData = buildPersistedGarminPostActivitySplits(activity.metrics, activity.sportType);
  return splitData.splits.length ? splitData : {};
}

async function loadGarminMultisportLegs(activity: {
  sportType: string;
  wearableConnectionId: string;
  externalId: string;
}) {
  if (!["triathlon", "duathlon", "aquathlon", "multisport"].includes(activity.sportType)) {
    return [];
  }

  const secret = await prisma.wearableSecret.findUnique({
    where: {
      wearableConnectionId_secretType: {
        wearableConnectionId: activity.wearableConnectionId,
        secretType: SecretType.GARMIN_API_KEY,
      },
    },
  });
  if (!secret) return [];

  try {
    const typedSplits = await garminProvider.getActivityTypedSplits({
      accountApiKey: decryptSecret(secret),
      activityId: activity.externalId,
    });
    return buildGarminMultisportLegs(typedSplits);
  } catch {
    return [];
  }
}

async function materializeGarminDailyDelivery(userId: string, canonicalType: string): Promise<MaterializedDelivery> {
  const parsed = parseGarminDailyDeliveryType(canonicalType);

  if (!parsed) {
    return { ok: false, errorCode: "GARMIN_DAILY_DELIVERY_TYPE_INVALID" };
  }

  const { variant, date } = parsed;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      whatsappIdentity: true,
      notificationPreference: true,
    },
  });

  if (!user?.whatsappIdentity?.verifiedAt || !user.notificationPreference?.dailySummary || !user.notificationPreference.enabled) {
    return { ok: false, errorCode: "DAILY_SUMMARY_NOT_ELIGIBLE" };
  }

  if (variant === "sync-check") {
    // Sync-check is a legacy queue type. Missing readings must never generate a
    // WhatsApp warning; a later run promotes this delivery to the normal summary
    // once the Garmin snapshot becomes complete.
    return { ok: false, errorCode: "GARMIN_DAILY_SUMMARY_WAITING_FOR_METRICS" };
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
    // Keep daily readiness on the same deterministic renderer used by the
    // preview. generateReport binds the bundled Geist TTF before rasterization.
    image: await generateReport(report.request),
    caption: report.caption,
    fileName: report.fileName.replace(".svg", ".png"),
  };
}

async function materializeGarminReconnectDelivery(canonicalType: string): Promise<MaterializedDelivery> {
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

function parseGarminReconnectDeliveryType(type: string) {
  const [prefix, connectionId, reason] = type.split(":");
  const prefixWithColon = `${prefix}:`;
  const isKnownPrefix = RECONNECT_ALERT_PREFIXES.some((known) => known === prefixWithColon);

  if (!isKnownPrefix || !connectionId || (reason !== "automatic" && reason !== "admin")) {
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
  if (!RECONNECT_ALERT_PREFIXES.some((prefix) => input.deliveryType.startsWith(prefix))) {
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

let registered = false;

/**
 * Registra os materializadores/hook/configurações do Garmin na camada genérica.
 * Idempotente: executado uma única vez no import do módulo.
 */
export function registerGarminReporting() {
  if (registered) {
    return;
  }

  registered = true;

  // Registro sob o prefixo GENÉRICO (canônico) com os prefixos LEGADOS como
  // aliases: o resolver aceita ambos, de modo que entregas antigas
  // (`DAILY_GARMIN_SUMMARY:`, `GARMIN_DAILY_SYNC_CHECK:`, `GARMIN_RECONNECT_ALERT:`)
  // continuam materializando e novos tipos genéricos também (Requisito 9.6).
  registerDeliveryMaterializer(POST_ACTIVITY_REPORT_PREFIX, ({ canonicalType }) =>
    materializePostActivityReport(canonicalType),
  );
  registerDeliveryMaterializer(
    GENERIC_DAILY_SUMMARY_PREFIX,
    ({ userId, canonicalType }) => materializeGarminDailyDelivery(userId, canonicalType),
    { aliases: [DAILY_GARMIN_SUMMARY_PREFIX] },
  );
  registerDeliveryMaterializer(
    GENERIC_DAILY_SYNC_CHECK_PREFIX,
    ({ userId, canonicalType }) => materializeGarminDailyDelivery(userId, canonicalType),
    { aliases: [GARMIN_DAILY_SYNC_CHECK_PREFIX] },
  );
  registerDeliveryMaterializer(
    GENERIC_RECONNECT_ALERT_PREFIX,
    ({ canonicalType }) => materializeGarminReconnectDelivery(canonicalType),
    { aliases: [GARMIN_RECONNECT_ALERT_PREFIX] },
  );

  registerDeliveryDispatchHook((outcome) =>
    recordGarminReconnectDeliveryEvent({
      deliveryType: outcome.deliveryType,
      userId: outcome.userId,
      status: outcome.status,
      sentTo: outcome.sentTo,
      errorCode: outcome.errorCode,
    }),
  );

  registerWhatsAppDispatchSettingsProvider(async () => {
    const settings = await getStoredGarminReportingSettings();

    return {
      whatsappDispatchPaused: settings.whatsappDispatchPaused,
      maxMessagesPerRun: settings.maxMessagesPerRun,
      delayBetweenMessagesSeconds: settings.delayBetweenMessagesSeconds,
      maxMessagesPerHour: settings.maxMessagesPerHour,
      maxMessagesPerDay: settings.maxMessagesPerDay,
    };
  });
}

// Efeito colateral de import: registra imediatamente ao carregar o módulo.
registerGarminReporting();
