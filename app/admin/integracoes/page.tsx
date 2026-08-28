import { DeliveryStatus } from "@prisma/client";

import { GarminJobsPanel } from "@/components/admin/garmin-jobs-panel";
import { GarminReconnectActions } from "@/components/admin/garmin-reconnect-actions";
import { HistoryCleanupPanel } from "@/components/admin/history-cleanup-panel";
import { MessageDeliveryPanel } from "@/components/admin/message-delivery-panel";
import { MessageThroughputChart } from "@/components/admin/message-throughput-chart";
import { WhatsAppReportPreviewPanel } from "@/components/admin/whatsapp-report-preview-panel";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { getGarminJobRunSchedule } from "@/server/garmin-reporting-settings";
import { getGarminDailySnapshotForUser, hasGarminDailySummaryMetrics } from "@/server/services/garmin-daily-report";
import {
  GARMIN_RECONNECT_NOTIFICATION_COOLDOWN_MS,
  getNextGarminSyncQueuePreview,
} from "@/server/services/garmin-service";

export const dynamic = "force-dynamic";

const DELIVERY_PAGE_SIZE = 20;
const THROUGHPUT_WINDOW_MS = 12 * 60 * 60 * 1000;
const CLEANUP_REFERENCE_DAYS = 30;

export default async function AdminIntegrationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ deliveryStatus?: string; deliveryType?: string; page?: string }>;
}) {
  await requireAdmin();
  const resolvedSearchParams = await searchParams;
  const activeDeliveryStatus = normalizeDeliveryStatus(resolvedSearchParams?.deliveryStatus);
  const activeDeliveryType = normalizeDeliveryType(resolvedSearchParams?.deliveryType);
  const currentPage = normalizePage(resolvedSearchParams?.page);
  const deliveryBaseWhere = {
    channel: "WHATSAPP" as const,
    provider: "EVOLUTION",
    ...(activeDeliveryType === "ALL" ? {} : { type: { startsWith: `${activeDeliveryType}:` } }),
  };
  const deliveryWhere = {
    ...deliveryBaseWhere,
    ...(activeDeliveryStatus === "ALL" ? {} : { status: activeDeliveryStatus }),
  };

  const throughputStart = getThroughputStart();
  const cleanupCutoff = getCleanupCutoff(CLEANUP_REFERENCE_DAYS);

  const [connections, events, garminJobSchedule, deliveryCounts, deliveryTypeCounts, totalDeliveries, nextSyncQueue, throughputRows, latestGarminActivity, cleanupCounts] = await Promise.all([
    prisma.wearableConnection.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 20,
      include: { user: true },
    }),
    prisma.integrationEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    getGarminJobRunSchedule(),
    prisma.messageDelivery.groupBy({
      by: ["status"],
      where: deliveryBaseWhere,
      _count: {
        _all: true,
      },
    }),
    Promise.all([
      prisma.messageDelivery.count({
        where: {
          channel: "WHATSAPP",
          provider: "EVOLUTION",
          type: {
            startsWith: "POST_ACTIVITY_REPORT:",
          },
        },
      }),
      prisma.messageDelivery.count({
        where: {
          channel: "WHATSAPP",
          provider: "EVOLUTION",
          type: {
            startsWith: "DAILY_GARMIN_SUMMARY:",
          },
        },
      }),
    ]),
    prisma.messageDelivery.count({
      where: deliveryWhere,
    }),
    getNextGarminSyncQueuePreview({ limit: 8 }),
    prisma.messageDelivery.findMany({
      where: {
        channel: "WHATSAPP",
        provider: "EVOLUTION",
        OR: [
          {
            sentAt: {
              gte: throughputStart,
            },
          },
          {
            failedAt: {
              gte: throughputStart,
            },
          },
        ],
      },
      select: {
        status: true,
        sentAt: true,
        failedAt: true,
      },
    }),
    prisma.activity.findFirst({
      where: {
        provider: "GARMIN",
      },
      orderBy: {
        startedAt: "desc",
      },
      select: {
        id: true,
        userId: true,
      },
    }),
    Promise.all([
      prisma.messageDelivery.count({
        where: {
          channel: "WHATSAPP",
          provider: "EVOLUTION",
        },
      }),
      prisma.messageDelivery.count({
        where: {
          channel: "WHATSAPP",
          provider: "EVOLUTION",
          createdAt: {
            lt: cleanupCutoff,
          },
          status: {
            in: ["SENT", "DELIVERED", "FAILED"],
          },
        },
      }),
      prisma.integrationEvent.count(),
      prisma.integrationEvent.count({
        where: {
          createdAt: {
            lt: cleanupCutoff,
          },
        },
      }),
      prisma.adminAuditLog.count(),
      prisma.adminAuditLog.count({
        where: {
          createdAt: {
            lt: cleanupCutoff,
          },
        },
      }),
    ]),
  ]);

  const reconnectUserIds = connections
    .filter((connection) => connection.provider === "GARMIN" && connection.status === "RECONNECT_REQUIRED")
    .map((connection) => connection.userId);
  const reconnectNotifications = reconnectUserIds.length
    ? await prisma.integrationEvent.findMany({
        where: {
          provider: "GARMIN",
          eventType: "GARMIN_RECONNECT_NOTIFICATION_SENT",
          userId: {
            in: reconnectUserIds,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          userId: true,
          createdAt: true,
        },
      })
    : [];
  const latestReconnectNotificationMap = new Map<string, Date>();

  for (const event of reconnectNotifications) {
    if (event.userId && !latestReconnectNotificationMap.has(event.userId)) {
      latestReconnectNotificationMap.set(event.userId, event.createdAt);
    }
  }

  const previewDate = getPreviewDate();
  const previewUserIds = Array.from(new Set([
    latestGarminActivity?.userId,
    ...connections.filter((connection) => connection.provider === "GARMIN").map((connection) => connection.userId),
  ].filter((userId): userId is string => Boolean(userId))));
  let dailySummaryPreviewUserId: string | null = null;

  for (const userId of previewUserIds.slice(0, 6)) {
    const snapshot = await getGarminDailySnapshotForUser(userId);

    if (hasGarminDailySummaryMetrics(snapshot)) {
      dailySummaryPreviewUserId = userId;
      break;
    }
  }

  const syncCheckPreviewUserId = previewUserIds[0] ?? null;
  const reconnectPreviewConnectionId = connections.find((connection) => connection.provider === "GARMIN" && connection.status === "RECONNECT_REQUIRED")?.id
    ?? connections.find((connection) => connection.provider === "GARMIN")?.id
    ?? null;
  const previewItems = [
    {
      id: "daily-summary",
      label: "Resumo diário Garmin",
      description: "Preview PNG do relatório fisiológico enviado quando prontidão, FC, VFC, Sleep Score e Body Battery estiverem completos.",
      href: dailySummaryPreviewUserId
        ? buildPreviewHref({ template: "daily-garmin-summary", userId: dailySummaryPreviewUserId, date: previewDate })
        : null,
      unavailableReason: "Nenhum usuário com snapshot diário completo disponível agora.",
    },
    {
      id: "post-activity",
      label: "Pós-atividade",
      description: "Preview PNG do template premium usado no envio do relatório automático após sincronização de treino.",
      href: latestGarminActivity?.id
        ? buildPreviewHref({ template: "post-activity-report", activityId: latestGarminActivity.id })
        : null,
      unavailableReason: "Nenhuma atividade Garmin recente encontrada para gerar preview.",
    },
    {
      id: "daily-warning",
      label: "Aviso de leituras pendentes",
      description: "Preview PNG do aviso clínico enviado quando Garmin ainda não entregou todas as leituras necessárias do dia.",
      href: syncCheckPreviewUserId
        ? buildPreviewHref({ template: "garmin-daily-sync-check", userId: syncCheckPreviewUserId, date: previewDate })
        : null,
      unavailableReason: "Nenhum usuário Garmin encontrado para simular aviso diário.",
    },
    {
      id: "reconnect",
      label: "Reconexão Garmin",
      description: "Preview PNG do alerta operacional enviado quando integração precisa ser refeita ou conta Garmin exige recuperação.",
      href: reconnectPreviewConnectionId
        ? buildPreviewHref({ template: "garmin-reconnect", connectionId: reconnectPreviewConnectionId })
        : null,
      unavailableReason: "Nenhuma conexão Garmin encontrada para simular alerta de reconexão.",
    },
  ];

  const totalPages = Math.max(1, Math.ceil(totalDeliveries / DELIVERY_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pagedDeliveries = await prisma.messageDelivery.findMany({
    where: deliveryWhere,
    orderBy: [{ createdAt: "desc" }],
    skip: (safePage - 1) * DELIVERY_PAGE_SIZE,
    take: DELIVERY_PAGE_SIZE,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  const deliveryCountMap = Object.fromEntries(
    deliveryCounts.map((entry) => [entry.status, entry._count._all]),
  ) as Record<string, number>;
  const deliveryTypeCountMap = {
    POST_ACTIVITY_REPORT: deliveryTypeCounts[0],
    DAILY_GARMIN_SUMMARY: deliveryTypeCounts[1],
  };
  const throughputBuckets = buildHourlyThroughputBuckets(throughputRows);

  return (
    <div className="space-y-4">
      <SectionCard title="Jobs Garmin" description="Controle intervalo, volume e cadência dos envios WhatsApp para evitar disparos agressivos no número operacional.">
        <GarminJobsPanel
          initialSettings={{
            jobIntervalMinutes: garminJobSchedule.settings.jobIntervalMinutes,
            maxUsersPerRun: garminJobSchedule.settings.maxUsersPerRun,
            maxProbesPerRun: garminJobSchedule.settings.maxProbesPerRun,
            delayBetweenUserSyncSeconds: garminJobSchedule.settings.delayBetweenUserSyncSeconds,
            maxMessagesPerRun: garminJobSchedule.settings.maxMessagesPerRun,
            delayBetweenMessagesSeconds: garminJobSchedule.settings.delayBetweenMessagesSeconds,
            maxMessagesPerHour: garminJobSchedule.settings.maxMessagesPerHour,
            maxMessagesPerDay: garminJobSchedule.settings.maxMessagesPerDay,
            whatsappDispatchPaused: garminJobSchedule.settings.whatsappDispatchPaused,
            lastRunAt: garminJobSchedule.lastRunAt?.toISOString() ?? null,
            nextAllowedAt: garminJobSchedule.nextAllowedAt?.toISOString() ?? null,
            due: garminJobSchedule.due,
          }}
        />
      </SectionCard>

      <SectionCard title="Preview dos templates WhatsApp" description="Inspeção rápida dos PNGs gerados para cada template já ativo na esteira operacional. Abre imagem final em nova aba, pronta para revisão visual.">
        <WhatsAppReportPreviewPanel previews={previewItems} />
      </SectionCard>

      <SectionCard title="Ritmo das últimas 12h" description="Mini histórico operacional de envios e falhas do WhatsApp para acompanhar ritmo e anomalias do número da ryvano.">
        <MessageThroughputChart buckets={throughputBuckets} />
      </SectionCard>

      <SectionCard title="Fila de mensagens" description="Acompanhe pendências, falhas e reprocessamentos do WhatsApp operacional.">
        <MessageDeliveryPanel
          activeStatus={activeDeliveryStatus}
          activeType={activeDeliveryType}
          counts={deliveryCountMap}
          typeCounts={deliveryTypeCountMap}
          currentPage={safePage}
          totalPages={totalPages}
          deliveries={pagedDeliveries.map((delivery) => ({
            id: delivery.id,
            userId: delivery.user.id,
            userLabel: delivery.user.name ?? delivery.user.email,
            type: delivery.type,
            status: delivery.status,
            errorCode: delivery.errorCode,
            externalMessageId: delivery.externalMessageId,
            createdAt: delivery.createdAt.toISOString(),
            sentAt: delivery.sentAt?.toISOString() ?? null,
            failedAt: delivery.failedAt?.toISOString() ?? null,
          }))}
        />
      </SectionCard>

      <SectionCard title="Limpeza de históricos" description="Retenção manual para reduzir volume de tabelas operacionais. Mantém entregas pendentes fora da exclusão e exige confirmação explícita no painel.">
        <HistoryCleanupPanel
          referenceDays={CLEANUP_REFERENCE_DAYS}
          counts={{
            messageDeliveriesTotal: cleanupCounts[0],
            messageDeliveriesEligible: cleanupCounts[1],
            integrationEventsTotal: cleanupCounts[2],
            integrationEventsEligible: cleanupCounts[3],
            adminAuditLogsTotal: cleanupCounts[4],
            adminAuditLogsEligible: cleanupCounts[5],
          }}
        />
      </SectionCard>

      <SectionCard title="Próximo lote Garmin" description="Prévia adaptativa de quem entra primeiro nas próximas rodadas de sincronização.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {nextSyncQueue.length ? (
            nextSyncQueue.map((entry) => (
              <div key={entry.userId} className="theme-panel-neutral rounded-[22px] border px-4 py-4 text-sm">
                <p className="font-semibold text-foreground">{entry.user.name ?? entry.user.email}</p>
                <p className="mt-2">Última sincronização: {formatDateTime(entry.lastSyncAt)}</p>
                <p>Próxima tentativa: {formatDateTime(entry.nextSyncAt)}</p>
                <p>Atualizado em: {formatDateTime(entry.updatedAt)}</p>
              </div>
            ))
          ) : (
            <div className="theme-panel-neutral rounded-[22px] border px-4 py-4 text-sm">
              Nenhum usuário Garmin elegível no momento.
            </div>
          )}
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Conexões" description="Acompanhe estado, sincronizações recentes e possíveis falhas.">
        <div className="grid gap-3">
          {connections.map((connection) => (
            <div key={connection.id} className="theme-panel-neutral rounded-[22px] border px-4 py-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-foreground">{connection.user.name ?? connection.user.email}</p>
                <StatusBadge tone={connection.status === "CONNECTED" ? "success" : connection.status === "ERROR" ? "danger" : "warning"}>{formatConnectionStatus(connection.status)}</StatusBadge>
              </div>
              <p className="mt-2">Origem: {connection.provider}</p>
              <p>Última sincronização: {formatDateTime(connection.lastSyncAt)}</p>
              <p>Status da sincronização: {connection.lastSyncStatus ?? "—"}</p>
              <p>Erro: {connection.lastErrorCode ?? "—"}</p>
              {connection.provider === "GARMIN" && connection.status === "RECONNECT_REQUIRED" ? (
                <GarminReconnectActions
                  userId={connection.userId}
                  lastSentAt={latestReconnectNotificationMap.get(connection.userId)?.toISOString() ?? null}
                  cooldownUntil={latestReconnectNotificationMap.get(connection.userId)
                    ? new Date(latestReconnectNotificationMap.get(connection.userId)!.getTime() + GARMIN_RECONNECT_NOTIFICATION_COOLDOWN_MS).toISOString()
                    : null}
                />
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>

        <SectionCard title="Eventos recentes" description="Acompanhe últimos registros recebidos pelas integrações.">
        <div className="grid gap-3">
          {events.length ? (
            events.map((event) => (
              <div key={event.id} className="theme-panel-neutral rounded-[22px] border px-4 py-4 text-sm">
                <p className="font-semibold text-foreground">{event.provider} · {event.eventType}</p>
                <p className="mt-2">Código externo: {event.externalId ?? "—"}</p>
                <p>Recebido em: {formatDateTime(event.createdAt)}</p>
              </div>
            ))
          ) : (
            <div className="theme-panel-neutral rounded-[22px] border px-4 py-4 text-sm">
              Nenhum evento registrado até o momento.
            </div>
          )}
        </div>
        </SectionCard>
      </div>
    </div>
  );
}

function formatConnectionStatus(status: string) {
  if (status === "CONNECTED") {
    return "Conectado";
  }

  if (status === "RECONNECT_REQUIRED") {
    return "Reconectar";
  }

  if (status === "ERROR") {
    return "Erro";
  }

  return status;
}

function normalizeDeliveryStatus(value: string | undefined): "ALL" | DeliveryStatus {
  const normalized = value?.toUpperCase();

  if (!normalized || normalized === "ALL") {
    return "ALL";
  }

  const valid = new Set<DeliveryStatus>(Object.values(DeliveryStatus));
  return valid.has(normalized as DeliveryStatus) ? (normalized as DeliveryStatus) : "ALL";
}

function getThroughputStart() {
  return new Date(Date.now() - THROUGHPUT_WINDOW_MS);
}

function normalizeDeliveryType(value: string | undefined) {
  const normalized = value?.toUpperCase();

  if (!normalized || normalized === "ALL") {
    return "ALL" as const;
  }

  if (normalized === "POST_ACTIVITY_REPORT" || normalized === "DAILY_GARMIN_SUMMARY") {
    return normalized;
  }

  return "ALL" as const;
}

function normalizePage(value: string | undefined) {
  const numeric = Number(value ?? "1");

  if (!Number.isFinite(numeric) || numeric < 1) {
    return 1;
  }

  return Math.floor(numeric);
}

function getPreviewDate() {
  return new Date().toISOString().slice(0, 10);
}

function getCleanupCutoff(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function buildPreviewHref(input: {
  template: "daily-garmin-summary" | "post-activity-report" | "garmin-daily-sync-check" | "garmin-reconnect";
  userId?: string;
  activityId?: string;
  connectionId?: string;
  date?: string;
}) {
  const params = new URLSearchParams({
    template: input.template,
  });

  if (input.userId) {
    params.set("userId", input.userId);
  }

  if (input.activityId) {
    params.set("activityId", input.activityId);
  }

  if (input.connectionId) {
    params.set("connectionId", input.connectionId);
  }

  if (input.date) {
    params.set("date", input.date);
  }

  return `/api/admin/whatsapp-reports/preview?${params.toString()}`;
}

function buildHourlyThroughputBuckets(
  rows: Array<{ status: DeliveryStatus; sentAt: Date | null; failedAt: Date | null }>,
) {
  const buckets = Array.from({ length: 12 }, (_, index) => {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() - (11 - index));

    return {
      key: formatHourBucketKey(date),
      label: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit" }).format(date),
      sent: 0,
      failed: 0,
    };
  });

  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const row of rows) {
    if (row.sentAt && (row.status === DeliveryStatus.SENT || row.status === DeliveryStatus.DELIVERED)) {
      const bucket = bucketMap.get(formatHourBucketKey(row.sentAt));

      if (bucket) {
        bucket.sent += 1;
      }
    }

    if (row.failedAt && row.status === DeliveryStatus.FAILED) {
      const bucket = bucketMap.get(formatHourBucketKey(row.failedAt));

      if (bucket) {
        bucket.failed += 1;
      }
    }
  }

  return buckets.map(({ label, sent, failed }) => ({ label, sent, failed }));
}

function formatHourBucketKey(value: Date) {
  const date = new Date(value);
  date.setMinutes(0, 0, 0);
  return date.toISOString().slice(0, 13);
}
