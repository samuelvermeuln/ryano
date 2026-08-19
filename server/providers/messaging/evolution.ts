import { requireEnv } from "@/server/env";
import type {
  MessageResult,
  MessagingProviderContract,
  MessagingStatus,
  QrCodeResult,
  SendTextInput,
} from "@/server/providers/messaging/types";

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
  async getStatus(): Promise<MessagingStatus> {
    const instanceName = requireEnv("EVOLUTION_INSTANCE_NAME");
    const response = await evolutionFetch(`/instance/connectionState/${instanceName}`);

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
    };
  }

  async getConnectQrCode(): Promise<QrCodeResult> {
    const instanceName = requireEnv("EVOLUTION_INSTANCE_NAME");
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

  async sendText(input: SendTextInput): Promise<MessageResult> {
    const instanceName = requireEnv("EVOLUTION_INSTANCE_NAME");
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
    const instanceName = requireEnv("EVOLUTION_INSTANCE_NAME");
    const response = await evolutionFetch(`/instance/logout/${instanceName}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error(`EVOLUTION_DISCONNECT_${response.status}`);
    }
  }
}

export const evolutionProvider = new EvolutionProvider();
