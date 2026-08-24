import { type AxiosRequestConfig } from "axios";

import { requireEnv } from "@/server/env";
import type {
  GarminDailyReportResult,
  WearableCapability,
  WearableConnectionResult,
  WearableProviderContract,
  WearableReconnectResult,
} from "@/server/providers/wearables/types";
import { createHttpClient } from "@/lib/http-client";

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
  const candidates = [record.detail, record.message, record.error];
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value.trim() : null;
}

let garminHttpClient: ReturnType<typeof createHttpClient> | null = null;

function getGarminHttpClient() {
  if (garminHttpClient) {
    return garminHttpClient;
  }

  garminHttpClient = createHttpClient({
    baseURL: requireEnv("GARMIN_SERVICE_BASE_URL"),
  });

  return garminHttpClient;
}

async function garminRequest<T = unknown>(path: string, config?: AxiosRequestConfig) {
  return getGarminHttpClient().request<T>({
    url: path,
    ...config,
  });
}

export class GarminProvider implements WearableProviderContract {
  provider = "GARMIN";
  capabilities: WearableCapability[] = ["activities", "health", "sleep", "recovery", "body"];

  async connect(input: { email: string; password: string; label: string }): Promise<WearableConnectionResult> {
    const response = await garminRequest<Record<string, unknown>>("/accounts", {
      method: "POST",
      headers: {
        "X-Admin-Key": requireEnv("GARMIN_ADMIN_KEY"),
      },
      data: input,
    });

    if (response.status < 200 || response.status >= 300) {
      const detail = getGarminErrorDetail(response.data);

      return {
        status: "error",
        message: detail ? `GARMIN_CONNECT_${response.status}:${detail}` : `GARMIN_CONNECT_${response.status}`,
      };
    }

    const payload = response.data;
    const mfaRequired = payload.mfa_required === true;

    if (mfaRequired) {
      return {
        status: "error",
        mfaRequired: true,
        accountApiKey: getAccountApiKey(payload),
        externalAccountId: getExternalAccountId(payload),
        message: "GARMIN_MFA_REQUIRED",
      };
    }

    return {
      status: "connected",
      externalAccountId: getExternalAccountId(payload),
      accountApiKey: getAccountApiKey(payload),
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
      throw new Error(`GARMIN_DAILY_REPORT_${response.status}`);
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
