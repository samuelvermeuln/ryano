"use server";

import { requireAdmin } from "@/server/auth-guards";
import { env } from "@/server/env";
import { evolutionProvider } from "@/server/providers/messaging/evolution";
import { assertRateLimit } from "@/server/rate-limit";
import { normalizePhoneToE164 } from "@/server/utils/phone";
import { prisma } from "@/server/db";

export type AdminActionState = {
  success?: boolean;
  message?: string;
  qrCode?: string | null;
};

export async function refreshEvolutionQrAction(): Promise<AdminActionState> {
  const admin = await requireAdmin();
  assertRateLimit(admin.id, 10, 1000 * 60 * 10, "admin-evolution-qr");

  const result = await evolutionProvider.getConnectQrCode();

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: admin.id,
      action: "EVOLUTION_QR_REFRESH",
      entityType: "EVOLUTION_INSTANCE",
      entityId: env.EVOLUTION_INSTANCE_NAME ?? "unknown",
      metadata: {
        status: result.status,
      },
    },
  });

  return {
    success: true,
    message: `QR atualizado. Estado atual: ${result.status}.`,
    qrCode: result.qrCode ?? null,
  };
}

export async function sendEvolutionTestMessageAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  assertRateLimit(admin.id, 8, 1000 * 60 * 10, "admin-evolution-test-message");

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
