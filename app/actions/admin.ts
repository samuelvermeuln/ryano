"use server";

import { revalidatePath } from "next/cache";

import { generateReport } from "@/lib/reports/generate-report";
import { prisma } from "@/server/db";
import {
  getEvolutionInstanceName,
  getEvolutionWebhookEvents,
} from "@/server/env";
import {
  getGarminJobRunSchedule,
  getGarminJobsRunEventType,
  getGarminReportingSettingsActionName,
  normalizeGarminReportingSettings,
} from "@/server/garmin-reporting-settings";
import { requireAdmin } from "@/server/auth-guards";
import { getStoredEvolutionHttpFallbackAllowed } from "@/server/evolution-settings";
import { evolutionProvider } from "@/server/providers/messaging/evolution";
import type { EvolutionInstanceEnsureResult } from "@/server/providers/messaging/types";
import { assertRateLimit, isRateLimitError } from "@/server/rate-limit";
import {
  getGarminReconnectNotificationCooldown,
  sendGarminReconnectNotification,
  syncAllGarminUsers,
} from "@/server/services/garmin-service";
import {
  dispatchPendingWhatsAppDeliveries,
  dispatchWhatsAppDeliveryById,
  enqueueDueDailyGarminSummaries,
  redeliverWhatsAppDeliveryById,
  requeueFailedWhatsAppDeliveries,
  requeueMessageDeliveryById,
} from "@/server/services/reporting";
import { normalizePhoneToE164 } from "@/server/utils/phone";

export type AdminActionState = {
  success?: boolean;
  message?: string;
  qrCode?: string | null;
  connected?: boolean;
  status?: string;
  identity?: string | null;
  phoneE164?: string | null;
  webhookEvents?: string;
  allowHttpFallback?: boolean;
  instanceEnsureStatus?: EvolutionInstanceEnsureResult["status"] | null;
  garminSyncSummary?: {
    eligibleUsers: number;
    scannedUsers: number;
    remainingUsers: number;
    syncedUsers: number;
    failedUsers: number;
    maxProbesPerRun: number;
    dailyDue: number;
    dailyQueued: number;
    dispatchScanned: number;
    dispatchSent: number;
    dispatchFailed: number;
  };
  garminSettings?: {
    jobIntervalMinutes: number;
    maxUsersPerRun: number;
    maxProbesPerRun: number;
    delayBetweenUserSyncSeconds: number;
    maxMessagesPerRun: number;
    delayBetweenMessagesSeconds: number;
    maxMessagesPerHour: number;
    maxMessagesPerDay: number;
    whatsappDispatchPaused: boolean;
    lastRunAt: string | null;
    nextAllowedAt: string | null;
    due: boolean;
  };
  messageQueueSummary?: {
    dispatched: number;
    failed: number;
    scanned: number;
    requeued: number;
    throttled: number;
    paused: boolean;
  };
  cleanupSummary?: {
    days: number;
    deletedMessageDeliveries: number;
    deletedIntegrationEvents: number;
    deletedAdminAuditLogs: number;
  };
  transportDebug?: {
    mode: "text" | "image";
    endpoint: string;
    variant?: string | null;
    attempts?: string[];
    errorDetail?: string | null;
  };
};

async function readEvolutionStatus() {
  const [status, webhookConfig, allowHttpFallback] = await Promise.all([
    evolutionProvider.getStatus(),
    evolutionProvider.getWebhookConfig(),
    getStoredEvolutionHttpFallbackAllowed(),
  ]);

  return {
    connected: status.connected,
    status: status.status,
    identity: status.identity ?? null,
    phoneE164: status.phoneE164 ?? null,
    webhookEvents: (webhookConfig?.events ?? getEvolutionWebhookEvents()).join(","),
    allowHttpFallback,
  };
}

function getInstanceEnsureMessage(status: EvolutionInstanceEnsureResult["status"]) {
  return status === "created" ? "Conexão preparada automaticamente." : "Conexão já estava pronta.";
}

function serializeGarminSettings(input: Awaited<ReturnType<typeof getGarminJobRunSchedule>>) {
  return {
    jobIntervalMinutes: input.settings.jobIntervalMinutes,
    maxUsersPerRun: input.settings.maxUsersPerRun,
    maxProbesPerRun: input.settings.maxProbesPerRun,
    delayBetweenUserSyncSeconds: input.settings.delayBetweenUserSyncSeconds,
    maxMessagesPerRun: input.settings.maxMessagesPerRun,
    delayBetweenMessagesSeconds: input.settings.delayBetweenMessagesSeconds,
    maxMessagesPerHour: input.settings.maxMessagesPerHour,
    maxMessagesPerDay: input.settings.maxMessagesPerDay,
    whatsappDispatchPaused: input.settings.whatsappDispatchPaused,
    lastRunAt: input.lastRunAt?.toISOString() ?? null,
    nextAllowedAt: input.nextAllowedAt?.toISOString() ?? null,
    due: input.due,
  };
}

export async function saveGarminReportingSettingsAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 10, 1000 * 60 * 10, "admin-garmin-settings");

  const settings = normalizeGarminReportingSettings({
    jobIntervalMinutes: formData.get("jobIntervalMinutes"),
    maxUsersPerRun: formData.get("maxUsersPerRun"),
    maxProbesPerRun: formData.get("maxProbesPerRun"),
    delayBetweenUserSyncSeconds: formData.get("delayBetweenUserSyncSeconds"),
    maxMessagesPerRun: formData.get("maxMessagesPerRun"),
    delayBetweenMessagesSeconds: formData.get("delayBetweenMessagesSeconds"),
    maxMessagesPerHour: formData.get("maxMessagesPerHour"),
    maxMessagesPerDay: formData.get("maxMessagesPerDay"),
    whatsappDispatchPaused: formData.get("whatsappDispatchPaused") === "on",
  });

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: getGarminReportingSettingsActionName(),
      entityType: "GARMIN_JOB_SETTINGS",
      entityId: "global",
      metadata: settings,
    },
  });

  const schedule = await getGarminJobRunSchedule();

  revalidatePath("/admin/integracoes");

  return {
    success: true,
    message: `Ajustes Garmin salvos. Intervalo: ${settings.jobIntervalMinutes} min. Probes por lote: ${settings.maxProbesPerRun}.`,
    garminSettings: serializeGarminSettings(schedule),
  };
}

export async function runGarminJobsAction(): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 6, 1000 * 60 * 10, "admin-garmin-jobs");

  try {
    const schedule = await getGarminJobRunSchedule();
    const syncSummary = await syncAllGarminUsers();
    const dailyQueueSummary = await enqueueDueDailyGarminSummaries();
    const dispatchSummary = await dispatchPendingWhatsAppDeliveries();

    await Promise.all([
      prisma.adminAuditLog.create({
        data: {
          actorUserId: admin.id,
          action: "GARMIN_JOBS_RUN",
          entityType: "GARMIN_JOB",
          entityId: "daily-sync-and-report",
          metadata: {
            settings: schedule.settings,
            syncSummary,
            dailyQueueSummary,
            dispatchSummary,
            trigger: "admin",
          },
        },
      }),
      prisma.integrationEvent.create({
        data: {
          provider: "GARMIN",
          eventType: getGarminJobsRunEventType(),
          payload: {
            settings: schedule.settings,
            syncSummary,
            dailyQueueSummary,
            dispatchSummary,
            trigger: "admin",
          },
        },
      }),
    ]);

    revalidatePath("/admin/integracoes");
    revalidatePath("/app/integracoes");
    revalidatePath("/app/dashboard");

    const updatedSchedule = await getGarminJobRunSchedule();

    return {
      success: true,
      message: `Jobs Garmin executados. Sync lote: ${syncSummary.scannedUsers}/${syncSummary.eligibleUsers}. Restantes: ${syncSummary.remainingUsers}. Fila enviada: ${dispatchSummary.sent}/${dispatchSummary.scanned}.`,
      garminSyncSummary: {
        eligibleUsers: syncSummary.eligibleUsers,
        scannedUsers: syncSummary.scannedUsers,
        remainingUsers: syncSummary.remainingUsers,
        syncedUsers: syncSummary.syncedUsers,
        failedUsers: syncSummary.failedUsers,
        maxProbesPerRun: syncSummary.maxProbesPerRun,
        dailyDue: dailyQueueSummary.due,
        dailyQueued: dailyQueueSummary.queued,
        dispatchScanned: dispatchSummary.scanned,
        dispatchSent: dispatchSummary.sent,
        dispatchFailed: dispatchSummary.failed,
      },
      garminSettings: serializeGarminSettings(updatedSchedule),
    };
  } catch (error) {
    await prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "GARMIN_JOBS_RUN_FAILED",
        entityType: "GARMIN_JOB",
        entityId: "daily-sync-and-report",
        metadata: {
          error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        },
      },
    }).catch(() => undefined);

    return {
      success: false,
      message: isRateLimitError(error)
        ? "Muitas tentativas. Aguarde alguns minutos."
        : error instanceof Error
          ? error.message
          : "Não foi possível executar jobs Garmin agora.",
    };
  }
}

export async function sendGarminReconnectNotificationAction(userId: string): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 10, 1000 * 60 * 10, "admin-garmin-reconnect-notification");

  const cooldown = await getGarminReconnectNotificationCooldown(userId);

  if (cooldown.active) {
    const remainingMinutes = Math.floor(cooldown.remainingMs / 60000);
    const remainingSeconds = Math.floor((cooldown.remainingMs % 60000) / 1000);

    return {
      success: false,
      message: `Reenvio Garmin em cooldown. Aguarde ${remainingMinutes}:${String(remainingSeconds).padStart(2, "0")}.`,
    };
  }

  const connection = await prisma.wearableConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: "GARMIN",
      },
    },
    select: {
      id: true,
      lastErrorCode: true,
      status: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!connection) {
    return {
      success: false,
      message: "Conexão Garmin não encontrada para este usuário.",
    };
  }

  if (connection.status !== "RECONNECT_REQUIRED") {
    return {
      success: false,
      message: "Esta conexão Garmin não está em estado de revalidação obrigatória.",
    };
  }

  const result = await sendGarminReconnectNotification({
    userId,
    connectionId: connection.id,
    errorCode: connection.lastErrorCode,
    reason: "admin",
  });

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "GARMIN_RECONNECT_NOTIFICATION_SENT",
      targetUserId: userId,
      entityType: "GARMIN_CONNECTION",
      entityId: connection.id,
      metadata: {
        status: connection.status,
        lastErrorCode: connection.lastErrorCode,
        deliveryResult: result,
      },
    },
  });

  revalidatePath("/admin/integracoes");
  revalidatePath("/app/integracoes");

  return {
    success: result.sent,
    message: result.reason === "WHATSAPP_NOT_VERIFIED"
      ? "Usuário ainda não confirmou o WhatsApp. Link Garmin não foi enviado."
      : result.sent
        ? `Mensagem de revalidação Garmin enviada para ${connection.user.name ?? connection.user.email}.`
        : "Não foi possível enviar mensagem de revalidação Garmin agora.",
  };
}

export async function dispatchPendingMessageDeliveriesAction(): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 10, 1000 * 60 * 10, "admin-message-delivery-dispatch");

  const dispatchSummary = await dispatchPendingWhatsAppDeliveries();

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "MESSAGE_DELIVERY_DISPATCH",
      entityType: "WHATSAPP_DELIVERY_QUEUE",
      entityId: "global",
      metadata: dispatchSummary,
    },
  }).catch(() => undefined);

  revalidatePath("/admin/integracoes");
  revalidatePath("/admin/usuarios");

  return {
    success: true,
    message: dispatchSummary.paused
      ? "Fila pausada globalmente. Nenhuma mensagem foi enviada."
      : `Fila processada. Enviadas: ${dispatchSummary.sent}. Falhas: ${dispatchSummary.failed}.`,
    messageQueueSummary: {
      dispatched: dispatchSummary.sent,
      failed: dispatchSummary.failed,
      scanned: dispatchSummary.scanned,
      requeued: 0,
      throttled: dispatchSummary.throttled,
      paused: dispatchSummary.paused,
    },
  };
}

export async function forceDispatchPendingMessageDeliveriesAction(): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 6, 1000 * 60 * 10, "admin-message-delivery-force-dispatch");

  const dispatchSummary = await dispatchPendingWhatsAppDeliveries({ ignorePause: true });

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "MESSAGE_DELIVERY_FORCE_DISPATCH",
      entityType: "WHATSAPP_DELIVERY_QUEUE",
      entityId: "global",
      metadata: dispatchSummary,
    },
  }).catch(() => undefined);

  revalidatePath("/admin/integracoes");
  revalidatePath("/admin/usuarios");

  return {
    success: true,
    message: `Forçado envio manual. Enviadas: ${dispatchSummary.sent}. Falhas: ${dispatchSummary.failed}.`,
    messageQueueSummary: {
      dispatched: dispatchSummary.sent,
      failed: dispatchSummary.failed,
      scanned: dispatchSummary.scanned,
      requeued: 0,
      throttled: dispatchSummary.throttled,
      paused: false,
    },
  };
}

export async function requeueFailedMessageDeliveriesAction(): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 10, 1000 * 60 * 10, "admin-message-delivery-requeue-failed");

  const result = await requeueFailedWhatsAppDeliveries();

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "MESSAGE_DELIVERY_REQUEUE_FAILED",
      entityType: "WHATSAPP_DELIVERY_QUEUE",
      entityId: "global",
      metadata: result,
    },
  }).catch(() => undefined);

  revalidatePath("/admin/integracoes");
  revalidatePath("/admin/usuarios");

  return {
    success: true,
    message: `Falhas reenfileiradas: ${result.requeued}.`,
    messageQueueSummary: {
      dispatched: 0,
      failed: 0,
      scanned: result.scanned,
      requeued: result.requeued,
      throttled: 0,
      paused: false,
    },
  };
}

export async function requeueMessageDeliveryAction(deliveryId: string): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 20, 1000 * 60 * 10, "admin-message-delivery-requeue-one");

  const result = await requeueMessageDeliveryById(deliveryId);

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "MESSAGE_DELIVERY_REQUEUE_ONE",
      entityType: "WHATSAPP_DELIVERY",
      entityId: deliveryId,
      metadata: result,
    },
  }).catch(() => undefined);

  revalidatePath("/admin/integracoes");
  revalidatePath("/admin/usuarios");

  return {
    success: result.updated,
    message: result.updated ? "Entrega reenfileirada." : "Entrega não pôde ser reenfileirada.",
    messageQueueSummary: {
      dispatched: 0,
      failed: 0,
      scanned: 1,
      requeued: result.updated ? 1 : 0,
      throttled: 0,
      paused: false,
    },
  };
}

export async function requeueAndDispatchMessageDeliveryAction(deliveryId: string): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 20, 1000 * 60 * 10, "admin-message-delivery-retry-debug");

  const result = await dispatchWhatsAppDeliveryById(deliveryId);

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "MESSAGE_DELIVERY_RETRY_DEBUG",
      entityType: "WHATSAPP_DELIVERY",
      entityId: deliveryId,
      metadata: result,
    },
  }).catch(() => undefined);

  revalidatePath("/admin/integracoes");
  revalidatePath("/admin/usuarios");

  return {
    success: result.ok && result.reason === "SENT",
    message: !result.ok
      ? "Entrega não pôde ser processada agora."
      : result.reason === "SENT"
        ? "Entrega processada com sucesso no modo de diagnóstico."
        : `Entrega falhou novamente. ${result.detail ?? ""}`.trim(),
    transportDebug: result.debug
      ? {
          ...result.debug,
          errorDetail: result.detail ?? null,
        }
      : result.detail
        ? {
            mode: "image",
            endpoint: "—",
            variant: null,
            attempts: [],
            errorDetail: result.detail,
          }
        : undefined,
    messageQueueSummary: {
      dispatched: result.ok && result.reason === "SENT" ? 1 : 0,
      failed: result.ok && result.reason === "FAILED" ? 1 : 0,
      scanned: 1,
      requeued: result.ok ? 1 : 0,
      throttled: 0,
      paused: false,
    },
  };
}

export async function redeliverUpdatedMessageDeliveryAction(deliveryId: string): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 20, 1000 * 60 * 10, "admin-message-delivery-redeliver-updated");

  const result = await redeliverWhatsAppDeliveryById(deliveryId, { dispatchNow: true });

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "MESSAGE_DELIVERY_REDELIVER_UPDATED",
      entityType: "WHATSAPP_DELIVERY",
      entityId: deliveryId,
      metadata: result,
    },
  }).catch(() => undefined);

  revalidatePath("/admin/integracoes");
  revalidatePath("/admin/usuarios");

  return {
    success: result.ok && result.reason === "SENT",
    message: !result.ok
      ? "Entrega não pôde ser reenviada com dados atualizados agora."
      : result.reason === "SENT"
        ? "Mensagem reenviada com dados atualizados."
        : `Reenvio atualizado falhou. ${result.detail ?? ""}`.trim(),
    transportDebug: result.debug
      ? {
          ...result.debug,
          errorDetail: result.detail ?? null,
        }
      : result.detail
        ? {
            mode: "image",
            endpoint: "—",
            variant: null,
            attempts: [],
            errorDetail: result.detail,
          }
        : undefined,
    messageQueueSummary: {
      dispatched: result.ok && result.reason === "SENT" ? 1 : 0,
      failed: result.ok && result.reason === "FAILED" ? 1 : 0,
      scanned: 1,
      requeued: result.ok ? 1 : 0,
      throttled: 0,
      paused: false,
    },
  };
}

export async function cleanupOperationalHistoryAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 4, 1000 * 60 * 10, "admin-history-cleanup");

  const days = Math.max(1, Math.min(3650, Number(formData.get("days") ?? "30") || 30));
  const confirm = String(formData.get("confirm") ?? "").trim().toUpperCase();
  const shouldDeleteMessageDeliveries = formData.get("messageDeliveries") === "on";
  const shouldDeleteIntegrationEvents = formData.get("integrationEvents") === "on";
  const shouldDeleteAdminAuditLogs = formData.get("adminAuditLogs") === "on";

  if (!shouldDeleteMessageDeliveries && !shouldDeleteIntegrationEvents && !shouldDeleteAdminAuditLogs) {
    return {
      success: false,
      message: "Selecione ao menos um histórico para limpeza.",
    };
  }

  if (confirm !== "LIMPAR") {
    return {
      success: false,
      message: 'Digite "LIMPAR" para confirmar a operação.',
    };
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const cleanupSummary = await prisma.$transaction(async (tx) => {
    const messageDeliveriesResult = shouldDeleteMessageDeliveries
      ? await tx.messageDelivery.deleteMany({
          where: {
            createdAt: {
              lt: cutoff,
            },
            status: {
              in: ["SENT", "DELIVERED", "FAILED"],
            },
          },
        })
      : { count: 0 };
    const integrationEventsResult = shouldDeleteIntegrationEvents
      ? await tx.integrationEvent.deleteMany({
          where: {
            createdAt: {
              lt: cutoff,
            },
          },
        })
      : { count: 0 };
    const adminAuditLogsResult = shouldDeleteAdminAuditLogs
      ? await tx.adminAuditLog.deleteMany({
          where: {
            createdAt: {
              lt: cutoff,
            },
          },
        })
      : { count: 0 };

    return {
      days,
      deletedMessageDeliveries: messageDeliveriesResult.count,
      deletedIntegrationEvents: integrationEventsResult.count,
      deletedAdminAuditLogs: adminAuditLogsResult.count,
    };
  });

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "OPERATIONAL_HISTORY_CLEANUP",
      entityType: "OPERATIONAL_HISTORY",
      entityId: `older-than-${days}-days`,
      metadata: cleanupSummary,
    },
  }).catch(() => undefined);

  revalidatePath("/admin/integracoes");
  revalidatePath("/admin/usuarios");

  return {
    success: true,
    message: `Limpeza concluída. Entregas: ${cleanupSummary.deletedMessageDeliveries}. Eventos: ${cleanupSummary.deletedIntegrationEvents}. Auditoria: ${cleanupSummary.deletedAdminAuditLogs}.`,
    cleanupSummary,
  };
}

export async function refreshEvolutionQrAction(): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 10, 1000 * 60 * 10, "admin-evolution-qr");

  try {
    const currentStatus = await readEvolutionStatus();

    if (currentStatus.connected) {
      return {
        success: true,
        message: `Instância já conectada. Estado atual: ${currentStatus.status}.`,
        qrCode: null,
        instanceEnsureStatus: "existing",
        ...currentStatus,
      };
    }

    const ensured = await evolutionProvider.ensureInstanceExists();
    const result = await evolutionProvider.getConnectQrCode();
    const status = await readEvolutionStatus();

    await prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "EVOLUTION_QR_REFRESH",
        entityType: "EVOLUTION_INSTANCE",
        entityId: getEvolutionInstanceName(),
        metadata: {
          status: result.status,
          connected: status.connected,
          instanceEnsureStatus: ensured.status,
        },
      },
    });

    return {
      success: true,
      message: status.connected
        ? `${getInstanceEnsureMessage(ensured.status)} Instância conectada. Estado atual: ${status.status}.`
        : `${getInstanceEnsureMessage(ensured.status)} QR atualizado. Estado atual: ${status.status}.`,
      qrCode: status.connected ? null : (result.qrCode ?? null),
      instanceEnsureStatus: ensured.status,
      ...status,
    };
  } catch (error) {
    await prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "EVOLUTION_QR_REFRESH_FAILED",
        entityType: "EVOLUTION_INSTANCE",
        entityId: getEvolutionInstanceName(),
        metadata: {
          error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        },
      },
    }).catch(() => undefined);

    return {
      success: false,
      message: isRateLimitError(error)
        ? "Muitas tentativas. Aguarde alguns minutos."
        : error instanceof Error
          ? error.message
          : "Não foi possível atualizar o QR Code.",
      qrCode: null,
      connected: false,
      status: "ERROR",
      identity: null,
      instanceEnsureStatus: null,
    };
  }
}

export async function refreshEvolutionStateAction(): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 30, 1000 * 60 * 10, "admin-evolution-state");

  try {
    const status = await readEvolutionStatus();

    return {
      success: true,
      message: `Estado atual: ${status.status}.`,
      qrCode: null,
      ...status,
    };
  } catch (error) {
    return {
      success: false,
      message: isRateLimitError(error)
        ? "Muitas tentativas. Aguarde alguns minutos."
        : error instanceof Error
          ? error.message
          : "Não foi possível atualizar os dados da conexão.",
      qrCode: null,
    };
  }
}

export async function updateEvolutionWebhookConfigAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 8, 1000 * 60 * 10, "admin-evolution-webhook-config");

  const rawEvents = String(formData.get("events") ?? "")
    .split(",")
    .map((event) => event.trim().toUpperCase())
    .filter(Boolean);
  const allowHttpFallback = String(formData.get("allowHttpFallback") ?? "false") === "true";

  if (rawEvents.length === 0) {
    return {
      success: false,
      message: "Informe ao menos um evento.",
      webhookEvents: getEvolutionWebhookEvents().join(","),
      allowHttpFallback: await getStoredEvolutionHttpFallbackAllowed(),
      instanceEnsureStatus: null,
    };
  }

  try {
    const ensured = await evolutionProvider.ensureInstanceExists();

    await evolutionProvider.configureWebhook({
      events: rawEvents,
      allowHttpFallback,
    });

    await prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "EVOLUTION_WEBHOOK_CONFIG_UPDATE",
        entityType: "EVOLUTION_INSTANCE",
        entityId: getEvolutionInstanceName(),
        metadata: {
          events: rawEvents,
          allowHttpFallback,
          instanceEnsureStatus: ensured.status,
        },
      },
    });

    const status = await readEvolutionStatus();

    return {
      success: true,
      message: `${getInstanceEnsureMessage(ensured.status)} Ajustes de recebimento atualizados.`,
      qrCode: null,
      ...status,
      webhookEvents: rawEvents.join(","),
      allowHttpFallback,
      instanceEnsureStatus: ensured.status,
    };
  } catch (error) {
    await prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "EVOLUTION_WEBHOOK_CONFIG_UPDATE_FAILED",
        entityType: "EVOLUTION_INSTANCE",
        entityId: getEvolutionInstanceName(),
        metadata: {
          events: rawEvents,
          allowHttpFallback,
          error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        },
      },
    }).catch(() => undefined);

    return {
      success: false,
      message: isRateLimitError(error)
        ? "Muitas tentativas. Aguarde alguns minutos."
        : error instanceof Error
          ? error.message
          : "Não foi possível salvar os ajustes de recebimento.",
      webhookEvents: rawEvents.join(","),
      allowHttpFallback,
      instanceEnsureStatus: null,
    };
  }
}

export async function disconnectEvolutionInstanceAction(): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 6, 1000 * 60 * 10, "admin-evolution-disconnect");

  try {
    await evolutionProvider.disconnect();
    const status = await readEvolutionStatus();

    await prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "EVOLUTION_DISCONNECT",
        entityType: "EVOLUTION_INSTANCE",
        entityId: getEvolutionInstanceName(),
        metadata: {
          status: status.status,
          connected: status.connected,
        },
      },
    });

    return {
      success: true,
      message: `Conexão encerrada. Estado atual: ${status.status}.`,
      qrCode: null,
      ...status,
    };
  } catch (error) {
    return {
      success: false,
      message: isRateLimitError(error)
        ? "Muitas tentativas. Aguarde alguns minutos."
        : error instanceof Error
          ? error.message
          : "Não foi possível desconectar agora.",
      qrCode: null,
    };
  }
}

export async function sendEvolutionTestImageAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 8, 1000 * 60 * 10, "admin-evolution-test-image");

  const phone = normalizePhoneToE164(String(formData.get("phone") ?? ""));
  const caption = String(formData.get("caption") ?? "").trim() || "Diagnóstico gráfico da Evolution x Ryvano.";

  if (!phone) {
    return { message: "Informe um telefone válido." };
  }

  const image = await generateReport({
    template: "evolution-media-diagnostic",
    data: {
      title: "Teste crítico de fonte e conteúdo",
      subtitle: `Destino ${phone}`,
      message: "Se fonte estiver correta, este card deve mostrar texto legível, números, acentos e métricas reais sem quadrados: ABC 123 ç ã é ê ô.",
      metrics: [
        { label: "Texto fixo", value: "ABC 123 ç ã é" },
        { label: "Valor numérico", value: "62 bpm · 7.8 h" },
        { label: "Instância", value: getEvolutionInstanceName() },
      ],
      chart: {
        title: "Validação visual",
        type: "bar",
        data: [
          { label: "ABC", value: 1, formattedValue: "ABC" },
          { label: "123", value: 1, formattedValue: "123" },
          { label: "çãé", value: 1, formattedValue: "çãé" },
        ],
        note: "Se qualquer bloco acima aparecer como quadrado, ainda existe falha na rasterização tipográfica do PNG.",
      },
      footer: "Teste administrativo gerado manualmente para diagnóstico de fonte, texto e mídia da integração.",
      status: "warning",
      theme: {
        family: "diagnostic",
        sport: "default",
        variant: "mist",
      },
    },
  });
  const result = await evolutionProvider.sendImage({
    to: phone,
    image,
    caption,
    fileName: `ryvano-evolution-diagnostic-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.png`,
  });

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "EVOLUTION_TEST_IMAGE",
      entityType: "WHATSAPP_MEDIA",
      entityId: result.externalMessageId ?? null,
      metadata: {
        phone,
        status: result.status,
        errorDetail: result.errorDetail ?? null,
        debug: result.debug ?? null,
      },
    },
  });

  if (result.status !== "sent") {
    return {
      success: false,
      message: `Falha ao enviar imagem de teste. ${result.errorDetail ?? ""}`.trim(),
      transportDebug: result.debug
        ? {
            ...result.debug,
            errorDetail: result.errorDetail ?? null,
          }
        : undefined,
    };
  }

  return {
    success: true,
    message: "Imagem de teste enviada.",
    transportDebug: result.debug
      ? {
          ...result.debug,
          errorDetail: null,
        }
      : undefined,
  };
}

export async function sendEvolutionTestMessageAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 8, 1000 * 60 * 10, "admin-evolution-test-message");

  const phone = normalizePhoneToE164(String(formData.get("phone") ?? ""));
  const text = String(formData.get("text") ?? "").trim();

  if (!phone) {
    return { message: "Informe um telefone válido." };
  }

  if (!text) {
    return { message: "Informe texto da mensagem de teste." };
  }

  const result = await evolutionProvider.sendText({ to: phone, text });

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "EVOLUTION_TEST_MESSAGE",
      entityType: "WHATSAPP_MESSAGE",
      entityId: result.externalMessageId ?? null,
      metadata: {
        phone,
        status: result.status,
      },
    },
  });

  if (result.status !== "sent") {
    return {
      message: `Falha ao enviar mensagem de teste. ${result.errorDetail ?? ""}`.trim(),
      transportDebug: result.debug
        ? {
            ...result.debug,
            errorDetail: result.errorDetail ?? null,
          }
        : undefined,
    };
  }

  return {
    success: true,
    message: "Mensagem de teste enviada.",
    transportDebug: result.debug
      ? {
          ...result.debug,
          errorDetail: null,
        }
      : undefined,
  };
}
