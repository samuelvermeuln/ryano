import { prisma } from "@/server/db";

export const DEFAULT_GARMIN_JOB_INTERVAL_MINUTES = 5;
export const DEFAULT_GARMIN_MAX_USERS_PER_RUN = 5;
export const DEFAULT_GARMIN_SYNC_DELAY_SECONDS = 10;
export const DEFAULT_GARMIN_MAX_MESSAGES_PER_RUN = 3;
export const DEFAULT_GARMIN_MESSAGE_DELAY_SECONDS = 20;
export const DEFAULT_GARMIN_MAX_MESSAGES_PER_HOUR = 24;
export const DEFAULT_GARMIN_MAX_MESSAGES_PER_DAY = 150;

const GARMIN_REPORTING_SETTINGS_ACTION = "GARMIN_REPORTING_SETTINGS_UPDATE";
const GARMIN_JOBS_RUN_EVENT_TYPE = "JOB_RUN_SUCCESS";

export type GarminReportingSettings = {
  jobIntervalMinutes: number;
  maxUsersPerRun: number;
  delayBetweenUserSyncSeconds: number;
  maxMessagesPerRun: number;
  delayBetweenMessagesSeconds: number;
  maxMessagesPerHour: number;
  maxMessagesPerDay: number;
  whatsappDispatchPaused: boolean;
};

export async function getStoredGarminReportingSettings(): Promise<GarminReportingSettings> {
  const log = await prisma.adminAuditLog.findFirst({
    where: {
      action: GARMIN_REPORTING_SETTINGS_ACTION,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      metadata: true,
    },
  });

  return normalizeGarminReportingSettings(asRecord(log?.metadata));
}

export async function getGarminJobRunSchedule(input?: { now?: Date }) {
  const now = input?.now ?? new Date();
  const settings = await getStoredGarminReportingSettings();
  const lastRun = await prisma.integrationEvent.findFirst({
    where: {
      provider: "GARMIN",
      eventType: GARMIN_JOBS_RUN_EVENT_TYPE,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      createdAt: true,
    },
  });

  const lastRunAt = lastRun?.createdAt ?? null;
  const nextAllowedAt = lastRunAt
    ? new Date(lastRunAt.getTime() + settings.jobIntervalMinutes * 60 * 1000)
    : null;

  return {
    settings,
    lastRunAt,
    nextAllowedAt,
    due: !nextAllowedAt || nextAllowedAt <= now,
  };
}

export function normalizeGarminReportingSettings(value?: Record<string, unknown> | null): GarminReportingSettings {
  return {
    jobIntervalMinutes: clampInteger(value?.jobIntervalMinutes, DEFAULT_GARMIN_JOB_INTERVAL_MINUTES, 1, 1440),
    maxUsersPerRun: clampInteger(value?.maxUsersPerRun, DEFAULT_GARMIN_MAX_USERS_PER_RUN, 1, 500),
    delayBetweenUserSyncSeconds: clampInteger(value?.delayBetweenUserSyncSeconds, DEFAULT_GARMIN_SYNC_DELAY_SECONDS, 0, 300),
    maxMessagesPerRun: clampInteger(value?.maxMessagesPerRun, DEFAULT_GARMIN_MAX_MESSAGES_PER_RUN, 1, 500),
    delayBetweenMessagesSeconds: clampInteger(value?.delayBetweenMessagesSeconds, DEFAULT_GARMIN_MESSAGE_DELAY_SECONDS, 0, 300),
    maxMessagesPerHour: clampInteger(value?.maxMessagesPerHour, DEFAULT_GARMIN_MAX_MESSAGES_PER_HOUR, 1, 5000),
    maxMessagesPerDay: clampInteger(value?.maxMessagesPerDay, DEFAULT_GARMIN_MAX_MESSAGES_PER_DAY, 1, 50000),
    whatsappDispatchPaused: booleanFrom(value?.whatsappDispatchPaused, false),
  };
}

export function getGarminReportingSettingsActionName() {
  return GARMIN_REPORTING_SETTINGS_ACTION;
}

export function getGarminJobsRunEventType() {
  return GARMIN_JOBS_RUN_EVENT_TYPE;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function booleanFrom(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  return fallback;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim() && Number.isFinite(Number(value))
        ? Number(value)
        : fallback;

  return Math.min(max, Math.max(min, Math.round(numeric)));
}
