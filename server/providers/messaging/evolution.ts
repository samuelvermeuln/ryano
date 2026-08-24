import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

import {
  env,
  getEvolutionInstanceName,
  getEvolutionWebhookEvents,
  getEvolutionWebhookUrl,
  requireEnv,
} from "@/server/env";
import { getStoredEvolutionHttpFallbackAllowed } from "@/server/evolution-settings";
import type {
  ConfigureWebhookInput,
  EvolutionInstanceEnsureResult,
  MessageResult,
  MessagingProviderContract,
  MessagingStatus,
  QrCodeResult,
  SendTextInput,
  WebhookConfig,
} from "@/server/providers/messaging/types";
import { createHttpClient, getAxiosErrorCauseCode } from "@/lib/http-client";
import { normalizePhoneToE164 } from "@/server/utils/phone";

const EVOLUTION_DISCONNECT_WAIT_ATTEMPTS = 12;
const EVOLUTION_DISCONNECT_WAIT_MS = 500;

let evolutionHttpClient: ReturnType<typeof createHttpClient> | null = null;

function getEvolutionHttpClient() {
  if (evolutionHttpClient) {
    return evolutionHttpClient;
  }

  evolutionHttpClient = createHttpClient({
    baseURL: requireEnv("EVOLUTION_API_BASE_URL"),
    headers: {
      apikey: requireEnv("EVOLUTION_API_KEY"),
      "Content-Type": "application/json",
    },
  });

  return evolutionHttpClient;
}

async function evolutionRequest<T = unknown>(path: string, config?: AxiosRequestConfig) {
  try {
    return await getEvolutionHttpClient().request<T>({
      url: path,
      ...config,
    });
  } catch (error) {
    throw new Error(getEvolutionRequestErrorMessage(error));
  }
}

export class EvolutionProvider implements MessagingProviderContract {
  private ensureInstancePromise: Promise<EvolutionInstanceEnsureResult> | null = null;

  async ensureInstanceExists(): Promise<EvolutionInstanceEnsureResult> {
    if (this.ensureInstancePromise) {
      return this.ensureInstancePromise;
    }

    this.ensureInstancePromise = this.ensureInstanceExistsInternal();

    try {
      return await this.ensureInstancePromise;
    } finally {
      this.ensureInstancePromise = null;
    }
  }

  async getStatus(): Promise<MessagingStatus> {
    const instanceName = getEvolutionInstanceName();
    let response = await evolutionRequest(`/instance/connectionState/${instanceName}`);

    if (isInstanceMissingResponse(response)) {
      await this.ensureInstanceExists();
      response = await evolutionRequest(`/instance/connectionState/${instanceName}`);
    }

    if (response.status < 200 || response.status >= 300) {
      return { connected: false, status: `ERROR_${response.status}` };
    }

    const connectionState = getConnectionStateFromPayload(response.data);
    const instance = await this.getInstanceDetails(instanceName);
    const status = connectionState ?? getInstanceConnectionStatus(instance) ?? "unknown";
    const identity = getInstanceIdentity(instance);
    const phoneE164 = getInstancePhone(instance) ?? extractPhoneFromIdentity(identity);

    return {
      connected: isConnectedStatus(status),
      status,
      identity,
      phoneE164,
    };
  }

  async getConnectQrCode(): Promise<QrCodeResult> {
    await this.ensureInstanceExists();

    const currentStatus = await this.getStatus();

    if (currentStatus.connected) {
      return { status: currentStatus.status, qrCode: null };
    }

    const instanceName = getEvolutionInstanceName();
    const response = await evolutionRequest(`/instance/connect/${instanceName}`);

    if (response.status < 200 || response.status >= 300) {
      return { status: `ERROR_${response.status}` };
    }

    const payload = response.data as Record<string, unknown>;
    const qrCode =
      typeof payload.base64 === "string"
        ? payload.base64
        : typeof payload.qrcode === "string"
          ? payload.qrcode
          : typeof payload.code === "string"
            ? payload.code
            : null;
    const latestStatus = await this.getStatus();

    return {
      status: latestStatus.status,
      qrCode,
    };
  }

  async getWebhookConfig(): Promise<WebhookConfig | null> {
    await this.ensureInstanceExists();

    const instanceName = getEvolutionInstanceName();
    const response = await evolutionRequest(`/webhook/find/${instanceName}`);

    if (response.status === 404) {
      return null;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`EVOLUTION_WEBHOOK_FIND_${response.status}`);
    }

    const payload = response.data as Record<string, unknown>;
    const events = Array.isArray(payload.events)
      ? payload.events.filter((event): event is string => typeof event === "string")
      : [];

    return {
      url: typeof payload.url === "string" ? payload.url : null,
      events,
      enabled: payload.enabled !== false,
    };
  }

  async configureWebhook(input: ConfigureWebhookInput): Promise<void> {
    await this.ensureInstanceExists();

    const instanceName = getEvolutionInstanceName();
    const response = await evolutionRequest(`/webhook/set/${instanceName}`, {
      method: "POST",
      data: {
        webhook: {
          enabled: true,
          url: getEvolutionWebhookUrl({ allowHttpFallback: input.allowHttpFallback }),
          webhookByEvents: true,
          webhookBase64: false,
          events: input.events,
          headers: getEvolutionWebhookHeaders(),
        },
      },
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`EVOLUTION_WEBHOOK_CONFIG_${response.status}`);
    }
  }

  async sendText(input: SendTextInput): Promise<MessageResult> {
    await this.ensureInstanceExists();

    const instanceName = getEvolutionInstanceName();
    const response = await evolutionRequest(`/message/sendText/${instanceName}`, {
      method: "POST",
      data: {
        number: input.to.replace(/\D/g, ""),
        text: input.text,
      },
    });

    if (response.status < 200 || response.status >= 300) {
      return { status: "failed" };
    }

    const payload = response.data as Record<string, unknown>;
    const key = (payload.key ?? null) as Record<string, unknown> | null;

    return {
      status: "sent",
      externalMessageId:
        typeof key?.id === "string"
          ? key.id
          : typeof payload.id === "string"
            ? payload.id
            : null,
    };
  }

  async disconnect(): Promise<void> {
    const instanceName = getEvolutionInstanceName();
    const statusResponse = await evolutionRequest(`/instance/connectionState/${instanceName}`);

    if (isInstanceMissingResponse(statusResponse)) {
      return;
    }

    if (statusResponse.status < 200 || statusResponse.status >= 300) {
      throw new Error(`EVOLUTION_DISCONNECT_${statusResponse.status}`);
    }

    const currentState = getConnectionStateFromPayload(statusResponse.data);

    if (!currentState || isDisconnectedStatus(currentState)) {
      return;
    }

    const response = await evolutionRequest(`/instance/logout/${instanceName}`, {
      method: "DELETE",
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`EVOLUTION_DISCONNECT_${response.status}`);
    }

    await waitForDisconnected(instanceName);
  }

  private async ensureInstanceExistsInternal(): Promise<EvolutionInstanceEnsureResult> {
    const instanceName = getEvolutionInstanceName();
    const statusResponse = await evolutionRequest(`/instance/connectionState/${instanceName}`);

    if (statusResponse.status >= 200 && statusResponse.status < 300) {
      return { status: "existing" };
    }

    if (!isInstanceMissingResponse(statusResponse)) {
      return { status: "existing" };
    }

    const baseWebhookConfig = {
      enabled: true,
      url: getEvolutionWebhookUrl({ allowHttpFallback: await getStoredEvolutionHttpFallbackAllowed() }),
      webhookByEvents: true,
      webhookBase64: false,
      events: getEvolutionWebhookEvents(),
      headers: getEvolutionWebhookHeaders(),
    };

    const creationAttempts = [
      {
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: baseWebhookConfig,
      },
      {
        name: instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: baseWebhookConfig,
      },
      {
        instanceName,
        token: requireEnv("EVOLUTION_API_KEY"),
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: baseWebhookConfig,
      },
    ];

    let lastStatus = 0;

    for (const body of creationAttempts) {
      const response = await evolutionRequest("/instance/create", {
        method: "POST",
        data: body,
      });

      if (response.status >= 200 && response.status < 300) {
        return { status: "created" };
      }

      if (response.status === 409) {
        return { status: "existing" };
      }

      lastStatus = response.status;
    }

    throw new Error(`EVOLUTION_INSTANCE_CREATE_${lastStatus || statusResponse.status}`);
  }

  private async getInstanceDetails(instanceName: string) {
    const response = await evolutionRequest(`/instance/fetchInstances`);

    if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
      return null;
    }

    return response.data.find((instance): instance is Record<string, unknown> => {
      if (typeof instance !== "object" || instance === null) {
        return false;
      }

      const candidateName = "name" in instance ? instance.name : undefined;
      const candidateInstanceName = "instanceName" in instance ? instance.instanceName : undefined;

      return candidateName === instanceName || candidateInstanceName === instanceName;
    }) ?? null;
  }
}

export const evolutionProvider = new EvolutionProvider();

function extractPhoneFromIdentity(identity: string | null) {
  if (!identity) {
    return null;
  }

  const number = identity.replace(/@.+$/, "").split(":")[0] ?? identity;
  return normalizePhoneToE164(number);
}

function extractPhone(value: unknown) {
  return typeof value === "string" ? normalizePhoneToE164(value) : null;
}

function isInstanceMissingResponse(response: Pick<AxiosResponse, "status">) {
  return response.status === 404 || response.status === 400;
}

function getEvolutionWebhookHeaders() {
  return env.EVOLUTION_WEBHOOK_SECRET
    ? {
        "x-webhook-secret": env.EVOLUTION_WEBHOOK_SECRET,
      }
    : {};
}

function getEvolutionRequestErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const causeCode = getAxiosErrorCauseCode(error);

    if (causeCode === "DEPTH_ZERO_SELF_SIGNED_CERT") {
      return "Não foi possível conectar à Evolution API: certificado HTTPS autoassinado. Use http:// em EVOLUTION_API_BASE_URL no ambiente local ou configure certificado válido.";
    }

    return `Não foi possível conectar à Evolution API: ${error.message}`;
  }

  return error instanceof Error
    ? `Não foi possível conectar à Evolution API: ${error.message}`
    : "Não foi possível conectar à Evolution API.";
}

function getConnectionStateFromPayload(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const rootState = "state" in payload && typeof payload.state === "string" ? payload.state : null;
  const instance = "instance" in payload && typeof payload.instance === "object" && payload.instance !== null
    ? payload.instance as Record<string, unknown>
    : null;
  const instanceState = typeof instance?.state === "string" ? instance.state : null;
  const status = "status" in payload && typeof payload.status === "string" ? payload.status : null;

  return instanceState ?? rootState ?? status;
}

function getInstanceConnectionStatus(instance: Record<string, unknown> | null) {
  return typeof instance?.connectionStatus === "string"
    ? instance.connectionStatus
    : typeof instance?.state === "string"
      ? instance.state
      : null;
}

function getInstanceIdentity(instance: Record<string, unknown> | null) {
  if (typeof instance?.ownerJid === "string") {
    return instance.ownerJid;
  }

  return null;
}

function getInstancePhone(instance: Record<string, unknown> | null) {
  return extractPhone(instance?.number) ?? extractPhone(instance?.ownerJid);
}

function isConnectedStatus(status: string) {
  return /open|connected/i.test(status);
}

function isDisconnectedStatus(status: string) {
  return /close|closed|disconnect|logout/i.test(status);
}

async function waitForDisconnected(instanceName: string) {
  let lastState = "unknown";

  for (let attempt = 0; attempt < EVOLUTION_DISCONNECT_WAIT_ATTEMPTS; attempt += 1) {
    const response = await evolutionRequest(`/instance/connectionState/${instanceName}`);

    if (isInstanceMissingResponse(response)) {
      return;
    }

    if (response.status >= 200 && response.status < 300) {
      const state = getConnectionStateFromPayload(response.data) ?? "unknown";
      lastState = state;

      if (isDisconnectedStatus(state)) {
        return;
      }
    }

    await wait(EVOLUTION_DISCONNECT_WAIT_MS);
  }

  throw new Error(`EVOLUTION_DISCONNECT_PENDING_${lastState}`);
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
