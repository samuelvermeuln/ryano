"use server";

import { prisma } from "@/server/db";
import {
  getEvolutionInstanceName,
  getEvolutionWebhookEvents,
  isEvolutionHttpFallbackAllowed,
} from "@/server/env";
import { requireAdmin } from "@/server/auth-guards";
import { evolutionProvider } from "@/server/providers/messaging/evolution";
import { assertRateLimit, isRateLimitError } from "@/server/rate-limit";
import { normalizePhoneToE164 } from "@/server/utils/phone";

export type AdminActionState = {
  success?: boolean;
  message?: string;
  qrCode?: string | null;
  connected?: boolean;
  status?: string;
  identity?: string | null;
  phoneE164?: string | null;
  webhookEvents?: string;
  allowHttpFallback?: boolean;
};

async function readEvolutionStatus() {
  const status = await evolutionProvider.getStatus();

  return {
    connected: status.connected,
    status: status.status,
    identity: status.identity ?? null,
    phoneE164: status.phoneE164 ?? null,
    webhookEvents: getEvolutionWebhookEvents().join(","),
    allowHttpFallback: isEvolutionHttpFallbackAllowed(),
  };
}

export async function refreshEvolutionQrAction(): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 10, 1000 * 60 * 10, "admin-evolution-qr");

  try {
    const result = await evolutionProvider.getConnectQrCode();
    const status = await readEvolutionStatus();

    await prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "EVOLUTION_QR_REFRESH",
        entityType: "EVOLUTION_INSTANCE",
        entityId: getEvolutionInstanceName(),
        metadata: {
          status: result.status,
          connected: status.connected,
        },
      },
    });

    return {
      success: true,
      message: status.connected
        ? `Instância conectada. Estado atual: ${status.status}.`
        : `QR atualizado. Estado atual: ${result.status}.`,
      qrCode: status.connected ? null : (result.qrCode ?? null),
      ...status,
    };
  } catch (error) {
    return {
      success: false,
      message: isRateLimitError(error)
        ? "Muitas tentativas no painel Evolution. Aguarde alguns minutos."
        : error instanceof Error
          ? error.message
          : "Falha ao consultar QR da Evolution.",
      qrCode: null,
      connected: false,
      status: "ERROR",
      identity: null,
    };
  }
}

export async function updateEvolutionWebhookConfigAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 8, 1000 * 60 * 10, "admin-evolution-webhook-config");

  const rawEvents = String(formData.get("events") ?? "")
    .split(",")
    .map((event) => event.trim().toUpperCase())
    .filter(Boolean);
  const allowHttpFallback = String(formData.get("allowHttpFallback") ?? "false") === "true";

  if (rawEvents.length === 0) {
    return {
      success: false,
      message: "Informe ao menos um evento da Evolution.",
      webhookEvents: getEvolutionWebhookEvents().join(","),
      allowHttpFallback: isEvolutionHttpFallbackAllowed(),
    };
  }

  try {
    await evolutionProvider.configureWebhook({
      events: rawEvents,
      allowHttpFallback,
    });

    await prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "EVOLUTION_WEBHOOK_CONFIG_UPDATE",
        entityType: "EVOLUTION_INSTANCE",
        entityId: getEvolutionInstanceName(),
        metadata: {
          events: rawEvents,
          allowHttpFallback,
        },
      },
    });

    const status = await readEvolutionStatus();

    return {
      success: true,
      message: "Configuração de webhook enviada para Evolution.",
      qrCode: null,
      ...status,
      webhookEvents: rawEvents.join(","),
      allowHttpFallback,
    };
  } catch (error) {
    return {
      success: false,
      message: isRateLimitError(error)
        ? "Muitas tentativas de configuração Evolution. Aguarde alguns minutos."
        : error instanceof Error
          ? error.message
          : "Falha ao configurar webhook da Evolution.",
      webhookEvents: rawEvents.join(","),
      allowHttpFallback,
    };
  }
}

export async function disconnectEvolutionInstanceAction(): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 6, 1000 * 60 * 10, "admin-evolution-disconnect");

  try {
    await evolutionProvider.disconnect();
    const status = await readEvolutionStatus();

    await prisma.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "EVOLUTION_DISCONNECT",
        entityType: "EVOLUTION_INSTANCE",
        entityId: getEvolutionInstanceName(),
        metadata: {
          status: status.status,
          connected: status.connected,
        },
      },
    });

    return {
      success: true,
      message: `Instância desconectada. Estado atual: ${status.status}.`,
      qrCode: null,
      ...status,
    };
  } catch (error) {
    return {
      success: false,
      message: isRateLimitError(error)
        ? "Muitas tentativas de disconnect Evolution. Aguarde alguns minutos."
        : error instanceof Error
          ? error.message
          : "Falha ao desconectar instância Evolution.",
      qrCode: null,
    };
  }
}

export async function sendEvolutionTestMessageAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 8, 1000 * 60 * 10, "admin-evolution-test-message");

  const phone = normalizePhoneToE164(String(formData.get("phone") ?? ""));
  const text = String(formData.get("text") ?? "").trim();

  if (!phone) {
    return { message: "Informe telefone válido em E.164 ou formato brasileiro." };
  }

  if (!text) {
    return { message: "Informe texto da mensagem de teste." };
  }

  const result = await evolutionProvider.sendText({ to: phone, text });

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "EVOLUTION_TEST_MESSAGE",
      entityType: "WHATSAPP_MESSAGE",
      entityId: result.externalMessageId ?? null,
      metadata: {
        phone,
        status: result.status,
      },
    },
  });

  if (result.status !== "sent") {
    return { message: "Falha ao enviar mensagem de teste." };
  }

  return {
    success: true,
    message: "Mensagem de teste enviada.",
  };
}
