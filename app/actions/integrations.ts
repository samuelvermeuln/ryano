"use server";

import { requireSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { assertRateLimit, isRateLimitError } from "@/server/rate-limit";
import { connectGarminForUser, disconnectGarminForUser, syncGarminForUser } from "@/server/services/garmin-service";
import { generateWhatsAppActivation } from "@/server/services/whatsapp-activation";
import { garminConnectSchema } from "@/server/validators/integrations";

export type ActionState = {
  success?: boolean;
  message?: string;
  activationUrl?: string;
  expiresAt?: string;
};

export async function connectGarminAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = garminConnectSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Dados Garmin inválidos." };
  }

  try {
    await assertRateLimit(`garmin-connect:${session.user.id}`, 5, 1000 * 60 * 10);
    await connectGarminForUser({
      userId: session.user.id,
      email: parsed.data.email,
      password: parsed.data.password,
      label: `ryano-${session.user.id}`,
    });

    return { success: true, message: "Garmin conectada com sucesso." };
  } catch (error) {
    return {
      message: isRateLimitError(error)
        ? "Muitas tentativas de conexão Garmin. Aguarde alguns minutos."
        : error instanceof Error
          ? error.message
          : "Falha ao conectar Garmin.",
    };
  }
}

export async function syncGarminAction(): Promise<ActionState> {
  const session = await requireSession();

  try {
    await assertRateLimit(`garmin-sync:${session.user.id}`, 10, 1000 * 60 * 10);
    const result = await syncGarminForUser(session.user.id);
    return {
      success: true,
      message: `${result.syncedCount} atividades sincronizadas.`,
    };
  } catch (error) {
    return {
      message: isRateLimitError(error)
        ? "Muitas tentativas de sincronização Garmin. Aguarde alguns minutos."
        : error instanceof Error
          ? error.message
          : "Falha na sincronização Garmin.",
    };
  }
}

export async function disconnectGarminAction(): Promise<ActionState> {
  const session = await requireSession();
  await disconnectGarminForUser(session.user.id);

  return {
    success: true,
    message: "Garmin desconectada. Histórico preservado.",
  };
}

export async function generateWhatsAppActivationAction(): Promise<ActionState> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { profile: true },
  });

  if (!user?.profile?.phoneE164) {
    return {
      message: "Complete telefone no perfil antes de ativar WhatsApp.",
    };
  }

  try {
    await assertRateLimit(`whatsapp-activation:${session.user.id}`, 5, 1000 * 60 * 15);
    const result = await generateWhatsAppActivation(session.user.id, user.name, user.profile.phoneE164);
    return {
      success: true,
      message: "Link de ativação gerado.",
      activationUrl: result.activationUrl,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch (error) {
    return {
      message: isRateLimitError(error)
        ? "Muitas tentativas de ativação WhatsApp. Aguarde alguns minutos."
        : error instanceof Error
          ? error.message
          : "Não foi possível gerar ativação.",
    };
  }
}
