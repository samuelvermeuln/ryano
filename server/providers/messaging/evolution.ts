import {
  getEvolutionInstanceName,
  getEvolutionWebhookEvents,
  getEvolutionWebhookUrl,
  isEvolutionHttpFallbackAllowed,
  requireEnv,
} from "@/server/env";
import type {
  ConfigureWebhookInput,
  EvolutionInstanceEnsureResult,
  MessageResult,
  MessagingProviderContract,
  MessagingStatus,
  QrCodeResult,
  SendTextInput,
} from "@/server/providers/messaging/types";
import { normalizePhoneToE164 } from "@/server/utils/phone";

async function evolutionFetch(path: string, init?: RequestInit) {
  return fetch(`${requireEnv("EVOLUTION_API_BASE_URL")}${path}`, {
    ...init,
    headers: {
      apikey: requireEnv("EVOLUTION_API_KEY"),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
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
    let response = await evolutionFetch(`/instance/connectionState/${instanceName}`);

    if (isInstanceMissingResponse(response)) {
      await this.ensureInstanceExists();
      response = await evolutionFetch(`/instance/connectionState/${instanceName}`);
    }

    if (!response.ok) {
      return { connected: false, status: `ERROR_${response.status}` };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const instancePayload = (payload.instance ?? null) as Record<string, unknown> | null;
    const status = String(instancePayload?.state ?? payload.state ?? payload.status ?? "unknown");
    const identity =
      typeof instancePayload?.ownerJid === "string"
        ? instancePayload.ownerJid
        : typeof payload.ownerJid === "string"
          ? payload.ownerJid
          : null;

    return {
      connected: /open|connected/i.test(status),
      status,
      identity,
      phoneE164: extractPhoneFromIdentity(identity),
    };
  }

  async getConnectQrCode(): Promise<QrCodeResult> {
    await this.ensureInstanceExists();

    const instanceName = getEvolutionInstanceName();
    const response = await evolutionFetch(`/instance/connect/${instanceName}`);

    if (!response.ok) {
      return { status: `ERROR_${response.status}` };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const instancePayload = (payload.instance ?? null) as Record<string, unknown> | null;

    return {
      status: String(payload.status ?? instancePayload?.state ?? "unknown"),
      qrCode:
        typeof payload.base64 === "string"
          ? payload.base64
          : typeof payload.qrcode === "string"
            ? payload.qrcode
            : typeof payload.code === "string"
              ? payload.code
              : null,
    };
  }

  async configureWebhook(input: ConfigureWebhookInput): Promise<void> {
    await this.ensureInstanceExists();

    const instanceName = getEvolutionInstanceName();
    const response = await evolutionFetch(`/webhook/set/${instanceName}`, {
      method: "POST",
      body: JSON.stringify({
        enabled: true,
        url: getEvolutionWebhookUrl({ allowHttpFallback: input.allowHttpFallback }),
        webhookByEvents: true,
        webhookBase64: false,
        events: input.events,
        headers: requireEnv("EVOLUTION_WEBHOOK_SECRET")
          ? {
              "x-webhook-secret": requireEnv("EVOLUTION_WEBHOOK_SECRET"),
            }
          : {},
      }),
    });

    if (!response.ok) {
      throw new Error(`EVOLUTION_WEBHOOK_CONFIG_${response.status}`);
    }
  }

  async sendText(input: SendTextInput): Promise<MessageResult> {
    await this.ensureInstanceExists();

    const instanceName = getEvolutionInstanceName();
    const response = await evolutionFetch(`/message/sendText/${instanceName}`, {
      method: "POST",
      body: JSON.stringify({
        number: input.to.replace(/\D/g, ""),
        text: input.text,
      }),
    });

    if (!response.ok) {
      return { status: "failed" };
    }

    const payload = (await response.json()) as Record<string, unknown>;
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
    await this.ensureInstanceExists();

    const instanceName = getEvolutionInstanceName();
    const response = await evolutionFetch(`/instance/logout/${instanceName}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error(`EVOLUTION_DISCONNECT_${response.status}`);
    }
  }

  private async ensureInstanceExistsInternal(): Promise<EvolutionInstanceEnsureResult> {
    const instanceName = getEvolutionInstanceName();
    const statusResponse = await evolutionFetch(`/instance/connectionState/${instanceName}`);

    if (statusResponse.ok) {
      return { status: "existing" };
    }

    if (!isInstanceMissingResponse(statusResponse)) {
      return { status: "existing" };
    }

    const baseWebhookConfig = {
      enabled: true,
      url: getEvolutionWebhookUrl({ allowHttpFallback: isEvolutionHttpFallbackAllowed() }),
      webhookByEvents: true,
      webhookBase64: false,
      events: getEvolutionWebhookEvents(),
      headers: requireEnv("EVOLUTION_WEBHOOK_SECRET")
        ? {
            "x-webhook-secret": requireEnv("EVOLUTION_WEBHOOK_SECRET"),
          }
        : {},
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
      const response = await evolutionFetch("/instance/create", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return { status: "created" };
      }

      if (response.status === 409) {
        return { status: "existing" };
      }

      lastStatus = response.status;
    }

    throw new Error(`EVOLUTION_INSTANCE_CREATE_${lastStatus || statusResponse.status}`);
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

function isInstanceMissingResponse(response: Response) {
  return response.status === 404 || response.status === 400;
}
