import { requireEnv } from "@/server/env";
import type {
  WearableCapability,
  WearableConnectionResult,
  WearableProviderContract,
} from "@/server/providers/wearables/types";

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

export class GarminProvider implements WearableProviderContract {
  provider = "GARMIN";
  capabilities: WearableCapability[] = ["activities"];

  async connect(input: { email: string; password: string; label: string }): Promise<WearableConnectionResult> {
    const response = await fetch(`${requireEnv("GARMIN_SERVICE_BASE_URL")}/accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": requireEnv("GARMIN_ADMIN_KEY"),
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      return {
        status: "error",
        message: `GARMIN_CONNECT_${response.status}`,
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;

    return {
      status: "connected",
      externalAccountId: getExternalAccountId(payload),
      accountApiKey: getAccountApiKey(payload),
      message: "GARMIN_CONNECTED",
    };
  }

  async validateConnection(input: { accountApiKey: string }) {
    const response = await fetch(`${requireEnv("GARMIN_SERVICE_BASE_URL")}/activities?start=0&limit=1`, {
      headers: {
        "X-API-Key": input.accountApiKey,
      },
      cache: "no-store",
    });

    return {
      ok: response.ok,
      message: response.ok ? undefined : `GARMIN_VALIDATE_${response.status}`,
    };
  }

  async syncActivities(input: { accountApiKey: string; start?: number; limit?: number }) {
    const searchParams = new URLSearchParams({
      start: String(input.start ?? 0),
      limit: String(input.limit ?? 20),
    });

    const response = await fetch(
      `${requireEnv("GARMIN_SERVICE_BASE_URL")}/activities?${searchParams.toString()}`,
      {
        headers: {
          "X-API-Key": input.accountApiKey,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`GARMIN_SYNC_${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    return Array.isArray(payload) ? payload : [];
  }
}

export const garminProvider = new GarminProvider();
