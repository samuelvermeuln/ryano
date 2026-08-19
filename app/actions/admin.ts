"use server";

import { prisma } from "@/server/db";
import { env } from "@/server/env";
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
};

async function readEvolutionStatus() {
  const status = await evolutionProvider.getStatus();

  return {
    connected: status.connected,
    status: status.status,
    identity: status.identity ?? null,
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
        entityId: env.EVOLUTION_INSTANCE_NAME ?? "unknown",
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
        entityId: env.EVOLUTION_INSTANCE_NAME ?? "unknown",
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
