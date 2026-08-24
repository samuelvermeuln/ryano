import { type AxiosRequestConfig } from "axios";

import { requireEnv } from "@/server/env";
import type {
  WearableCapability,
  WearableConnectionResult,
  WearableProviderContract,
} from "@/server/providers/wearables/types";
import { createHttpClient } from "@/lib/http-client";

function getAccountApiKey(payload: Record<string, unknown>) {
  const candidates = [
    payload.apiKey,
    payload.xApiKey,
    payload.x_api_key,
    payload.accountApiKey,
    payload.account_api_key,
  ];

  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value : null;
}

function getExternalAccountId(payload: Record<string, unknown>) {
  const candidates = [payload.id, payload.accountId, payload.externalAccountId, payload.uuid];
  const value = candidates.find((candidate) => typeof candidate === "string" || typeof candidate === "number");
  return value ? String(value) : null;
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
  capabilities: WearableCapability[] = ["activities"];

  async connect(input: { email: string; password: string; label: string }): Promise<WearableConnectionResult> {
    const response = await garminRequest<Record<string, unknown>>("/accounts", {
      method: "POST",
      headers: {
        "X-Admin-Key": requireEnv("GARMIN_ADMIN_KEY"),
      },
      data: input,
    });

    if (response.status < 200 || response.status >= 300) {
      return {
        status: "error",
        message: `GARMIN_CONNECT_${response.status}`,
      };
    }

    const payload = response.data;

    return {
      status: "connected",
      externalAccountId: getExternalAccountId(payload),
      accountApiKey: getAccountApiKey(payload),
      message: "GARMIN_CONNECTED",
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
      message: response.status >= 200 && response.status < 300 ? undefined : `GARMIN_VALIDATE_${response.status}`,
    };
  }

  async syncActivities(input: { accountApiKey: string; start?: number; limit?: number }) {
    const searchParams = new URLSearchParams({
      start: String(input.start ?? 0),
      limit: String(input.limit ?? 20),
    });

    const response = await garminRequest<unknown>(`/activities?${searchParams.toString()}`, {
      headers: {
        "X-API-Key": input.accountApiKey,
      },
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GARMIN_SYNC_${response.status}`);
    }

    const payload = response.data as unknown;
    return Array.isArray(payload) ? payload : [];
  }
}

export const garminProvider = new GarminProvider();
