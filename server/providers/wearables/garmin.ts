import { type AxiosRequestConfig } from "axios";

import { requireEnv } from "@/server/env";
import { logger } from "@/server/logging/logger";
import type {
  GarminDailyReportResult,
  WearableCapability,
  WearableConnectionResult,
  WearableProviderContract,
  WearableReconnectResult,
} from "@/server/providers/wearables/types";
import { createHttpClient } from "@/lib/http-client";

const GARMIN_HTTP_TIMEOUT_MS = 60_000;

function getAccountApiKey(payload: Record<string, unknown>) {
  const candidates = [
    payload.apiKey,
    payload.api_key,
    payload.xApiKey,
    payload.x_api_key,
    payload.accountApiKey,
    payload.account_api_key,
  ];

  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value : null;
}

function getExternalAccountId(payload: Record<string, unknown>) {
  const candidates = [payload.id, payload.accountId, payload.account_id, payload.externalAccountId, payload.uuid];
  const value = candidates.find((candidate) => typeof candidate === "string" || typeof candidate === "number");
  return value ? String(value) : null;
}

function getGarminErrorDetail(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const code = typeof record.code === "string" && record.code.trim() ? record.code.trim() : null;
  const candidates = [record.detail, record.message, record.error];
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  const detail = typeof value === "string" ? value.trim() : null;

  if (code && detail && !detail.includes(code)) {
    return `${code}:${detail}`;
  }

  return detail ?? code;
}

function getEmailDomain(email: string) {
  const [, domain] = email.trim().split("@");
  return domain?.toLowerCase() ?? null;
}

let garminHttpClient: ReturnType<typeof createHttpClient> | null = null;

function getGarminHttpClient() {
  if (garminHttpClient) {
    return garminHttpClient;
  }

  garminHttpClient = createHttpClient({
    baseURL: requireEnv("GARMIN_SERVICE_BASE_URL"),
    timeout: GARMIN_HTTP_TIMEOUT_MS,
  });

  return garminHttpClient;
}

async function garminRequest<T = unknown>(path: string, config?: AxiosRequestConfig) {
  const startedAt = Date.now();
  const method = config?.method?.toUpperCase() ?? "GET";

  try {
    const response = await getGarminHttpClient().request<T>({
      url: path,
      ...config,
    });

    logger.info("Garmin API request completed", {
      method,
      path,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("timeout")) {
      logger.warn("Garmin API request timed out", {
        method,
        path,
        durationMs: Date.now() - startedAt,
        timeoutMs: GARMIN_HTTP_TIMEOUT_MS,
      });

      throw new Error("GARMIN_REQUEST_TIMEOUT");
    }

    logger.error("Garmin API request failed", {
      error,
      method,
      path,
      durationMs: Date.now() - startedAt,
    });

    throw error;
  }
}

async function garminAccountDataRequest<T = unknown>(accountApiKey: string, path: string) {
  const response = await garminRequest<{ data?: T }>(path, {
    headers: {
      "X-API-Key": accountApiKey,
    },
  });

  if (response.status < 200 || response.status >= 300) {
    const detail = getGarminErrorDetail(response.data);
    throw new Error(detail ? `GARMIN_ACTIVITY_${response.status}:${detail}` : `GARMIN_ACTIVITY_${response.status}`);
  }

  return response.data?.data;
}

export class GarminProvider implements WearableProviderContract {
  provider = "GARMIN";
  capabilities: WearableCapability[] = ["activities", "health", "sleep", "recovery", "body"];

  async connect(input: { email: string; password: string; label: string }): Promise<WearableConnectionResult> {
    logger.info("Garmin connect request started", {
      label: input.label,
      emailDomain: getEmailDomain(input.email),
    });

    const response = await garminRequest<Record<string, unknown>>("/accounts", {
      method: "POST",
      headers: {
        "X-Admin-Key": requireEnv("GARMIN_ADMIN_KEY"),
      },
      data: input,
    });

    if (response.status < 200 || response.status >= 300) {
      const detail = getGarminErrorDetail(response.data);
      logger.warn("Garmin connect request rejected", {
        status: response.status,
        detail,
        label: input.label,
      });

      return {
        status: "error",
        message: detail ? `GARMIN_CONNECT_${response.status}:${detail}` : `GARMIN_CONNECT_${response.status}`,
      };
    }

    const payload = response.data;
    const mfaRequired = payload.mfa_required === true;
    const accountApiKey = getAccountApiKey(payload);
    const externalAccountId = getExternalAccountId(payload);

    logger.info("Garmin connect request accepted", {
      label: input.label,
      externalAccountId,
      mfaRequired,
      hasAccountApiKey: Boolean(accountApiKey),
    });

    if (mfaRequired) {
      return {
        status: "error",
        mfaRequired: true,
        accountApiKey,
        externalAccountId,
        message: "GARMIN_MFA_REQUIRED",
      };
    }

    return {
      status: "connected",
      externalAccountId,
      accountApiKey,
      message: "GARMIN_CONNECTED",
    };
  }

  async reconnect(input: { accountApiKey: string }): Promise<WearableReconnectResult> {
    const response = await garminRequest<Record<string, unknown>>("/accounts/revalidate", {
      method: "POST",
      headers: {
        "X-API-Key": input.accountApiKey,
      },
    });

    if (response.status < 200 || response.status >= 300) {
      const detail = getGarminErrorDetail(response.data);
      return {
        ok: false,
        message: detail ? `GARMIN_RECONNECT_${response.status}:${detail}` : `GARMIN_RECONNECT_${response.status}`,
      };
    }

    const payload = response.data;
    const mfaRequired = payload.mfa_required === true;

    return {
      ok: !mfaRequired && payload.authenticated === true,
      mfaRequired,
      message:
        typeof payload.message === "string" && payload.message.trim()
          ? payload.message.trim()
          : mfaRequired
            ? "GARMIN_MFA_REQUIRED"
            : "GARMIN_RECONNECTED",
    };
  }

  async validateConnection(input: { accountApiKey: string }) {
    const response = await garminRequest("/activities?start=0&limit=1", {
      headers: {
        "X-API-Key": input.accountApiKey,
      },
    });

    return {
      ok: response.status >= 200 && response.status < 300,
      message:
        response.status >= 200 && response.status < 300
          ? undefined
          : (() => {
              const detail = getGarminErrorDetail(response.data);
              return detail ? `GARMIN_VALIDATE_${response.status}:${detail}` : `GARMIN_VALIDATE_${response.status}`;
            })(),
    };
  }

  async syncActivities(input: { accountApiKey: string; start?: number; limit?: number }) {
    const searchParams = new URLSearchParams({
      start: String(input.start ?? 0),
      limit: String(input.limit ?? 20),
    });

    const response = await garminRequest<{ data?: unknown }>(`/activities?${searchParams.toString()}`, {
      headers: {
        "X-API-Key": input.accountApiKey,
      },
    });

    if (response.status < 200 || response.status >= 300) {
      const detail = getGarminErrorDetail(response.data);
      throw new Error(detail ? `GARMIN_SYNC_${response.status}:${detail}` : `GARMIN_SYNC_${response.status}`);
    }

    const payload = response.data?.data;
    return Array.isArray(payload) ? payload : [];
  }

  async getLatestActivity(input: { accountApiKey: string; fresh?: boolean }) {
    const searchParams = new URLSearchParams({
      fresh: input.fresh === false ? "false" : "true",
    });

    return garminAccountDataRequest<unknown>(
      input.accountApiKey,
      `/activities/latest?${searchParams.toString()}`,
    );
  }

  async getActivitySummary(input: { accountApiKey: string; activityId: string }) {
    return garminAccountDataRequest<Record<string, unknown>>(input.accountApiKey, `/activities/${input.activityId}`);
  }

  async getActivityDetails(input: { accountApiKey: string; activityId: string; maxChart?: number; maxPoly?: number }) {
    const searchParams = new URLSearchParams({
      maxchart: String(input.maxChart ?? 2000),
      maxpoly: String(input.maxPoly ?? 4000),
    });

    return garminAccountDataRequest<Record<string, unknown>>(
      input.accountApiKey,
      `/activities/${input.activityId}/details?${searchParams.toString()}`,
    );
  }

  async getActivitySplits(input: { accountApiKey: string; activityId: string }) {
    const payload = await garminAccountDataRequest<unknown>(input.accountApiKey, `/activities/${input.activityId}/splits`);
    return Array.isArray(payload) ? payload : [];
  }

  async getActivityTypedSplits(input: { accountApiKey: string; activityId: string }) {
    const payload = await garminAccountDataRequest<unknown>(input.accountApiKey, `/activities/${input.activityId}/typed-splits`);
    return Array.isArray(payload) ? payload : [];
  }

  async getActivitySplitSummaries(input: { accountApiKey: string; activityId: string }) {
    const payload = await garminAccountDataRequest<unknown>(input.accountApiKey, `/activities/${input.activityId}/split-summaries`);
    return Array.isArray(payload) ? payload : [];
  }

  async getActivityWeather(input: { accountApiKey: string; activityId: string }) {
    const payload = await garminAccountDataRequest<unknown>(input.accountApiKey, `/activities/${input.activityId}/weather`);
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  }

  async getActivityHeartRateZones(input: { accountApiKey: string; activityId: string }) {
    return garminAccountDataRequest<unknown>(input.accountApiKey, `/activities/${input.activityId}/hr-zones`);
  }

  async getActivityPowerZones(input: { accountApiKey: string; activityId: string }) {
    return garminAccountDataRequest<unknown>(input.accountApiKey, `/activities/${input.activityId}/power-zones`);
  }

  async getActivityExerciseSets(input: { accountApiKey: string; activityId: string }) {
    const payload = await garminAccountDataRequest<unknown>(input.accountApiKey, `/activities/${input.activityId}/exercise-sets`);
    return Array.isArray(payload) ? payload : [];
  }

  async getDailyReport(input: { accountApiKey: string; date: string }): Promise<GarminDailyReportResult> {
    const response = await garminRequest<{
      account_id?: string;
      date?: string;
      cached?: boolean;
      summary?: Record<string, unknown> | null;
      health?: Record<string, unknown>;
      training?: Record<string, unknown>;
      body?: Record<string, unknown>;
      nutrition?: Record<string, unknown>;
      warnings?: string[];
    }>(`/daily-report/${input.date}`, {
      headers: {
        "X-API-Key": input.accountApiKey,
      },
    });

    if (response.status < 200 || response.status >= 300) {
      const detail = getGarminErrorDetail(response.data);
      throw new Error(detail ? `GARMIN_DAILY_REPORT_${response.status}:${detail}` : `GARMIN_DAILY_REPORT_${response.status}`);
    }

    return {
      accountId: response.data.account_id ?? "",
      date: response.data.date ?? input.date,
      cached: Boolean(response.data.cached),
      summary: response.data.summary ?? null,
      health: response.data.health ?? {},
      training: response.data.training ?? {},
      body: response.data.body ?? {},
      nutrition: response.data.nutrition ?? {},
      warnings: Array.isArray(response.data.warnings) ? response.data.warnings : [],
    };
  }
}

export const garminProvider = new GarminProvider();
