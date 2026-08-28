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
  IncomingMessage,
  MessageResult,
  MessagingProviderContract,
  MessagingStatus,
  QrCodeResult,
  SendImageInput,
  SendTextInput,
  WebhookConfig,
} from "@/server/providers/messaging/types";
import { createHttpClient, getAxiosErrorCauseCode } from "@/lib/http-client";
import { normalizePhoneToE164, toWhatsappJid } from "@/server/utils/phone";

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
          byEvents: false,
          webhookByEvents: false,
          base64: false,
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
    const endpoint = `/message/sendText/${instanceName}`;
    const response = await evolutionRequest(endpoint, {
      method: "POST",
      data: {
        number: input.to.replace(/\D/g, ""),
        text: input.text,
      },
    });

    return {
      ...getMessageResultFromResponse(response),
      debug: {
        mode: "text",
        endpoint,
        variant: "sendText",
        attempts: ["sendText :: 2xx"],
      },
    };
  }

  async sendImage(input: SendImageInput): Promise<MessageResult> {
    await this.ensureInstanceExists();

    const instanceName = getEvolutionInstanceName();
    const endpoint = `/message/sendMedia/${instanceName}`;
    const number = input.to.replace(/\D/g, "");
    const fileName = input.fileName?.trim() || `ryvano-report-${Date.now()}.png`;
    const rawBase64 = input.image.toString("base64");
    const dataUri = `data:image/png;base64,${rawBase64}`;
    const mediaMessage = {
      mediatype: "image",
      mimetype: "image/png",
      fileName,
      caption: input.caption,
    };
    const payloads = [
      {
        variant: "flat-media-data-uri",
        data: {
          number,
          ...mediaMessage,
          media: dataUri,
        },
      },
      {
        variant: "flat-media-raw-base64",
        data: {
          number,
          ...mediaMessage,
          media: rawBase64,
        },
      },
      {
        variant: "flat-base64-data-uri",
        data: {
          number,
          ...mediaMessage,
          base64: dataUri,
        },
      },
      {
        variant: "flat-base64-raw-base64",
        data: {
          number,
          ...mediaMessage,
          base64: rawBase64,
        },
      },
      {
        variant: "nested-mediaMessage-media-data-uri",
        data: {
          number,
          options: {
            encoding: true,
          },
          mediaMessage: {
            ...mediaMessage,
            media: dataUri,
          },
        },
      },
      {
        variant: "nested-mediaMessage-media-raw-base64",
        data: {
          number,
          options: {
            encoding: true,
          },
          mediaMessage: {
            ...mediaMessage,
            media: rawBase64,
          },
        },
      },
      {
        variant: "nested-mediaMessage-base64-raw-base64",
        data: {
          number,
          options: {
            encoding: true,
          },
          mediaMessage: {
            ...mediaMessage,
            base64: rawBase64,
          },
        },
      },
    ] as const;

    const attempts: string[] = [];
    let lastError: unknown = null;
    let lastFailureDetail: string | null = null;

    for (const payload of payloads) {
      try {
        const response = await evolutionRequest(endpoint, {
          method: "POST",
          data: payload.data,
        });
        const result = getMessageResultFromResponse(response);

        if (result.status === "sent") {
          return {
            ...result,
            debug: {
              mode: "image",
              endpoint,
              variant: payload.variant,
              attempts: [...attempts, `${payload.variant} :: 2xx`],
            },
          };
        }

        const failureDetail = result.errorDetail ?? "EVOLUTION_SEND_FAILED";
        attempts.push(`${payload.variant} :: ${failureDetail}`);
        lastFailureDetail = failureDetail;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        attempts.push(`${payload.variant} :: ${errorMessage}`);
        lastError = error;
      }
    }

    if (lastFailureDetail || lastError) {
      return {
        status: "failed",
        errorDetail: lastFailureDetail ?? (lastError instanceof Error ? lastError.message : "EVOLUTION_SEND_FAILED"),
        debug: {
          mode: "image",
          endpoint,
          variant: null,
          attempts,
        },
      };
    }

    return {
      status: "failed",
      errorDetail: "EVOLUTION_SEND_FAILED",
      debug: {
        mode: "image",
        endpoint,
        variant: null,
        attempts,
      },
    };
  }

  async findIncomingMessages(input: {
    phoneE164: string;
    since?: Date | null;
    until?: Date | null;
    take?: number;
  }): Promise<IncomingMessage[]> {
    await this.ensureInstanceExists();

    const instanceName = getEvolutionInstanceName();
    const response = await evolutionRequest(`/chat/findMessages/${instanceName}`, {
      method: "POST",
      data: {
        where: {
          remoteJid: toWhatsappJid(input.phoneE164),
        },
        take: input.take ?? 50,
        skip: 0,
        orderBy: {
          messageTimestamp: "desc",
        },
      },
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`EVOLUTION_MESSAGES_FIND_${response.status}`);
    }

    return getMessageRecords(response.data)
      .map(normalizeIncomingMessageRecord)
      .filter((message): message is IncomingMessage => Boolean(message))
      .filter((message) => isExpectedSender(message.senderPhone, input.phoneE164))
      .filter((message) => isWithinActivationWindow(message.timestamp, input.since, input.until));
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
      byEvents: false,
      webhookByEvents: false,
      base64: false,
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

function getMessageResultFromResponse(response: Pick<AxiosResponse, "status" | "data">): MessageResult {
  if (response.status < 200 || response.status >= 300) {
    return { status: "failed", errorDetail: `HTTP_${response.status}` };
  }

  const payload = response.data as Record<string, unknown>;
  const key = (payload.key ?? null) as Record<string, unknown> | null;
  const externalMessageId =
    typeof key?.id === "string"
      ? key.id
      : typeof payload.id === "string"
        ? payload.id
        : null;
  const failureDetail = getEvolutionMessageFailureDetail(payload);

  if (failureDetail && !externalMessageId) {
    return {
      status: "failed",
      errorDetail: failureDetail,
      externalMessageId: null,
    };
  }

  return {
    status: "sent",
    externalMessageId,
  };
}

function getEvolutionMessageFailureDetail(payload: Record<string, unknown>) {
  const status = payload.status;
  const error = payload.error;
  const detail = getEvolutionErrorDetail(payload.detail) ?? getEvolutionErrorDetail(payload.response);
  const message = typeof payload.message === "string" && payload.message.trim() ? payload.message.trim() : null;

  if (status === false || error === true) {
    return detail ?? message ?? getEvolutionErrorDetail(payload) ?? "EVOLUTION_SEND_FAILED";
  }

  if (typeof status === "string" && /fail|error|invalid|denied/i.test(status)) {
    return [status, message, detail].filter(Boolean).join(" :: ") || "EVOLUTION_SEND_FAILED";
  }

  if (typeof error === "string" && error.trim()) {
    return [error.trim(), message, detail].filter(Boolean).join(" :: ");
  }

  return null;
}

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

function getMessageRecords(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }

  const messages = "messages" in payload ? payload.messages : null;

  if (typeof messages !== "object" || messages === null) {
    return [];
  }

  const records = "records" in messages ? messages.records : null;

  return Array.isArray(records) ? records.filter((record): record is Record<string, unknown> => typeof record === "object" && record !== null) : [];
}

function normalizeIncomingMessageRecord(record: Record<string, unknown>) {
  const key = typeof record.key === "object" && record.key !== null ? record.key as Record<string, unknown> : null;
  const fromMe = record.fromMe === true || key?.fromMe === true;
  const text = getMessageText(record);

  if (fromMe || !text) {
    return null;
  }

  const senderJid = getSenderJid(key, record);

  return {
    text,
    senderPhone: extractPhone(senderJid),
    externalJid: typeof senderJid === "string" ? senderJid : null,
    timestamp: getMessageTimestamp(record),
  };
}

function getSenderJid(key: Record<string, unknown> | null, record: Record<string, unknown>) {
  return (
    getString(key, "remoteJidAlt") ??
    getString(key, "participant") ??
    getString(key, "remoteJid") ??
    getString(record, "remoteJidAlt") ??
    getString(record, "participant") ??
    getString(record, "remoteJid")
  );
}

function getString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value ? value : null;
}

function getMessageText(record: Record<string, unknown>) {
  const message = typeof record.message === "object" && record.message !== null ? record.message as Record<string, unknown> : null;

  return (
    getString(message, "conversation") ??
    getNestedString(message, ["extendedTextMessage", "text"]) ??
    getNestedString(message, ["imageMessage", "caption"]) ??
    getNestedString(message, ["videoMessage", "caption"]) ??
    getString(record, "body")
  );
}

function getNestedString(record: Record<string, unknown> | null, keys: string[]) {
  let current: unknown = record;

  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" && current ? current : null;
}

function getMessageTimestamp(record: Record<string, unknown>) {
  const timestamp = record.messageTimestamp ?? record.timestamp;

  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return new Date(timestamp * 1000);
  }

  if (typeof timestamp === "string" && timestamp) {
    const numericTimestamp = Number(timestamp);

    if (Number.isFinite(numericTimestamp)) {
      return new Date(numericTimestamp * 1000);
    }

    const parsedDate = new Date(timestamp);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  return null;
}

function isExpectedSender(senderPhone: string | null, expectedPhoneE164: string) {
  return senderPhone === normalizePhoneToE164(expectedPhoneE164);
}

function isWithinActivationWindow(timestamp: Date | null, since?: Date | null, until?: Date | null) {
  if (!timestamp) {
    return true;
  }

  const timestampMs = timestamp.getTime();
  const lowerBound = since ? since.getTime() - 1000 * 60 * 5 : null;
  const upperBound = until ? until.getTime() + 1000 * 60 * 5 : null;

  return (lowerBound === null || timestampMs >= lowerBound) && (upperBound === null || timestampMs <= upperBound);
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

    const status = error.response?.status;
    const detail = getEvolutionErrorDetail(error.response?.data);
    return `Não foi possível conectar à Evolution API${status ? ` (${status})` : ""}: ${detail ?? error.message}`;
  }

  return error instanceof Error
    ? `Não foi possível conectar à Evolution API: ${error.message}`
    : "Não foi possível conectar à Evolution API.";
}

function getEvolutionErrorDetail(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidates = [
    record.message,
    record.error,
    record.detail,
    record.response,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
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
