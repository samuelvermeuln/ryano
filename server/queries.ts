import type { Prisma } from "@prisma/client";
import { ConnectionStatus } from "@prisma/client";

import { prisma } from "@/server/db";
import {
  getGarminDailySnapshotForUser,
  getLatestGarminReconnectNotification,
  type GarminDailySnapshot,
} from "@/modules/garmin";
// Import de efeito colateral: registra o resolver de capabilities do catálogo,
// habilitando `getUserCapabilities` sobre os providers conectados.
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import {
  getUserCapabilities,
  type ProviderCapabilities,
} from "@/modules/shared/integrations/capabilities";
import type { ProviderId } from "@/modules/shared/integrations/types";

const dashboardTrendActivitySelect = {
  startedAt: true,
  durationSeconds: true,
  distanceMeters: true,
  sportType: true,
} satisfies Prisma.ActivitySelect;

const dashboardLatestActivitySelect = {
  id: true,
  name: true,
  sportType: true,
  startedAt: true,
  durationSeconds: true,
  distanceMeters: true,
  calories: true,
  averageHeartRate: true,
  maxHeartRate: true,
  metrics: true,
} satisfies Prisma.ActivitySelect;

const dashboardConnectionSelect = {
  provider: true,
  status: true,
  lastSyncAt: true,
  lastSyncStatus: true,
} satisfies Prisma.WearableConnectionSelect;

const dashboardGarminConnectionSelect = {
  status: true,
  lastSyncAt: true,
  lastSyncStatus: true,
} satisfies Prisma.WearableConnectionSelect;

const dashboardWhatsappIdentitySelect = {
  phoneE164: true,
  verifiedAt: true,
} satisfies Prisma.WhatsAppIdentitySelect;

type DashboardTrendActivity = Prisma.ActivityGetPayload<{ select: typeof dashboardTrendActivitySelect }>;
type DashboardConnection = Prisma.WearableConnectionGetPayload<{ select: typeof dashboardConnectionSelect }>;
type DashboardGarminConnection = Prisma.WearableConnectionGetPayload<{ select: typeof dashboardGarminConnectionSelect }>;
type DashboardWhatsappIdentity = Prisma.WhatsAppIdentityGetPayload<{ select: typeof dashboardWhatsappIdentitySelect }>;

/**
 * Deriva os providers conectados (0..N) a partir das conexões do usuário.
 *
 * Considera "conectado" todo provider cuja conexão não esteja `DISCONNECTED`,
 * mantendo apenas identificadores presentes no catálogo (descarta valores do
 * enum Prisma sem definição, ex.: `APPLE`). Provider-agnostic: o resultado é
 * usado para decidir capabilities e seções sem citar um provider específico.
 */
function deriveConnectedProviders(connections: DashboardConnection[]): ProviderId[] {
  const providers = new Set<ProviderId>();

  for (const connection of connections) {
    if (connection.status === ConnectionStatus.DISCONNECTED) {
      continue;
    }

    const providerId = connection.provider as ProviderId;
    if (getProviderDefinition(providerId)) {
      providers.add(providerId);
    }
  }

  return [...providers];
}

/**
 * Indica se as capabilities dos providers conectados incluem alguma seção
 * fisiológica diária (recovery/sleep/hrv/readiness/dailyWellness).
 */
function hasPhysiologicalCapability(capabilities: ProviderCapabilities): boolean {
  return Boolean(
    capabilities.recovery
    || capabilities.sleep
    || capabilities.hrv
    || capabilities.readiness
    || capabilities.dailyWellness,
  );
}

/**
 * Insights diários disponíveis para o usuário, decididos por capability.
 *
 * `connectedProviders` e `capabilities` são a união das conexões ativas. As
 * seções fisiológicas são opcionais: só há dado quando um provider conectado
 * declara a capability correspondente e realmente devolve leitura.
 */
export type AvailableDailyInsights = {
  connectedProviders: ProviderId[];
  capabilities: ProviderCapabilities;
  /** Snapshot fisiológico do Garmin (readiness/HRV/sono/Body Battery), se houver. */
  garminSnapshot: GarminDailySnapshot | null;
};

/**
 * Reúne os insights diários disponíveis para o usuário de forma
 * provider-agnostic e capability-driven.
 *
 * Consulta as conexões do usuário, calcula os providers conectados e a união de
 * capabilities, e busca os dados fisiológicos apenas quando alguma capability os
 * oferece. Para o Garmin, o dado vem do snapshot diário atual
 * (`getGarminDailySnapshotForUser`); providers sem capability fisiológica (ex.:
 * Strava) não disparam nenhuma busca e não geram seção.
 *
 * _Requisitos: 8.1, 8.2, 8.3, 8.5_
 */
export async function getAvailableDailyInsights(userId: string): Promise<AvailableDailyInsights> {
  const connections = await prisma.wearableConnection.findMany({
    where: { userId },
    select: dashboardConnectionSelect,
  });

  const connectedProviders = deriveConnectedProviders(connections);
  const capabilities = getUserCapabilities(connectedProviders);

  let garminSnapshot: GarminDailySnapshot | null = null;

  const garminConnection = connections.find((connection) => connection.provider === "GARMIN") ?? null;
  const garminActive = Boolean(
    garminConnection
    && garminConnection.status !== ConnectionStatus.DISCONNECTED
    && garminConnection.status !== ConnectionStatus.RECONNECT_REQUIRED,
  );

  if (garminActive && connectedProviders.includes("GARMIN") && hasPhysiologicalCapability(capabilities)) {
    garminSnapshot = await getGarminDailySnapshotForUser(userId);
  }

  return { connectedProviders, capabilities, garminSnapshot };
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getPeriodStart(days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function getBucketSize(days: number) {
  if (days <= 14) {
    return 1;
  }

  if (days <= 90) {
    return 7;
  }

  return 30;
}

function formatBucketLabel(date: Date, bucketSize: number) {
  if (bucketSize === 1) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(date);
  }

  if (bucketSize === 7) {
    return `Semana de ${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(date)}`;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function buildTrend(activities: DashboardTrendActivity[], days: number) {
  const bucketSize = getBucketSize(days);
  const periodStart = getPeriodStart(days);
  const bucketCount = Math.ceil(days / bucketSize);

  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(periodStart);
    bucketStart.setDate(periodStart.getDate() + index * bucketSize);

    return {
      label: formatBucketLabel(bucketStart, bucketSize),
      activityCount: 0,
      durationSeconds: 0,
      distanceMeters: 0,
    };
  });

  for (const activity of activities) {
    const diffDays = Math.floor((activity.startedAt.getTime() - periodStart.getTime()) / DAY_IN_MS);
    const bucketIndex = Math.max(0, Math.min(bucketCount - 1, Math.floor(diffDays / bucketSize)));
    const bucket = buckets[bucketIndex];

    bucket.activityCount += 1;
    bucket.durationSeconds += activity.durationSeconds ?? 0;
    bucket.distanceMeters += activity.distanceMeters ?? 0;
  }

  return buckets;
}

export async function getDashboardData(userId: string, days: number) {
  const periodStart = getPeriodStart(days);

  const [periodActivities, latestActivity, connections, whatsappIdentity] = await Promise.all([
    prisma.activity.findMany({
      where: {
        userId,
        startedAt: { gte: periodStart },
      },
      orderBy: { startedAt: "asc" },
      select: dashboardTrendActivitySelect,
    }),
    prisma.activity.findFirst({
      where: { userId },
      orderBy: { startedAt: "desc" },
      select: dashboardLatestActivitySelect,
    }),
    prisma.wearableConnection.findMany({
      where: { userId },
      select: dashboardConnectionSelect,
    }),
    prisma.whatsAppIdentity.findUnique({
      where: { userId },
      select: dashboardWhatsappIdentitySelect,
    }),
  ]);

  const connectedProviders = deriveConnectedProviders(connections);
  const garminConnectionRecord = connections.find((connection) => connection.provider === "GARMIN") ?? null;
  const garminConnection: DashboardGarminConnection | null = garminConnectionRecord
    ? {
        status: garminConnectionRecord.status,
        lastSyncAt: garminConnectionRecord.lastSyncAt,
        lastSyncStatus: garminConnectionRecord.lastSyncStatus,
      }
    : null;

  const [dailyInsights, latestGarminReconnectNotification] = await Promise.all([
    getAvailableDailyInsights(userId),
    garminConnection?.status === ConnectionStatus.RECONNECT_REQUIRED
      ? getLatestGarminReconnectNotification(userId)
      : Promise.resolve(null),
  ]);

  const garminToday = dailyInsights.garminSnapshot;

  const totalDurationSeconds = periodActivities.reduce(
    (total, activity) => total + (activity.durationSeconds ?? 0),
    0,
  );
  const totalDistanceMeters = periodActivities.reduce(
    (total, activity) => total + (activity.distanceMeters ?? 0),
    0,
  );
  const trainingDays = new Set(
    periodActivities.map((activity) => activity.startedAt.toISOString().slice(0, 10)),
  ).size;
  const sportTypesCount = new Set(periodActivities.map((activity) => activity.sportType)).size;
  const sportCounts = periodActivities.reduce((accumulator, activity) => {
    const key = activity.sportType?.trim() || "Atividade";
    accumulator.set(key, (accumulator.get(key) ?? 0) + 1);
    return accumulator;
  }, new Map<string, number>());
  const predominantSport = [...sportCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  const daysSinceLatestActivity = latestActivity
    ? Math.max(0, Math.floor((Date.now() - latestActivity.startedAt.getTime()) / DAY_IN_MS))
    : null;

  return {
    latestActivity,
    trend: buildTrend(periodActivities, days),
    connectedProviders,
    summary: {
      days,
      periodStart,
      activityCount: periodActivities.length,
      totalDurationSeconds,
      totalDistanceMeters,
      trainingDays,
      sportTypesCount,
      predominantSport,
      latestActivity,
      daysSinceLatestActivity,
      connectedProviders,
      capabilities: dailyInsights.capabilities,
      garminConnection,
      garminToday,
      latestGarminReconnectNotification,
      whatsappIdentity: whatsappIdentity as DashboardWhatsappIdentity | null,
    },
  };
}
