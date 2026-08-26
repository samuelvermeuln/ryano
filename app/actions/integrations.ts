"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";
import { assertRateLimit, isRateLimitError } from "@/server/rate-limit";
import { connectGarminForUser, disconnectGarminForUser, syncGarminForUser } from "@/server/services/garmin-service";
import {
  DEFAULT_DAILY_REPORT_TIME,
  DEFAULT_DAILY_REPORT_TIMEZONE,
  dispatchPendingWhatsAppDeliveries,
  normalizeReportTime,
} from "@/server/services/reporting";
import { generateWhatsAppActivation } from "@/server/services/whatsapp-activation";
import { garminConnectSchema } from "@/server/validators/integrations";

export type ActionState = {
  success?: boolean;
  message?: string;
  activationUrl?: string;
  expiresAt?: string;
  code?: "GARMIN_LOGIN_REQUIRED" | "GARMIN_MFA_REQUIRED" | "GARMIN_TEMPORARY_UNAVAILABLE";
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
      label: `ryvano-${session.user.id}`,
    });

    revalidatePath("/app/integracoes");
    revalidatePath("/app/dashboard");
    revalidatePath("/onboarding");

    return { success: true, message: "Garmin conectada com sucesso." };
  } catch (error) {
    if (isRateLimitError(error)) {
      return {
        message: "Muitas tentativas de conexão Garmin. Aguarde alguns minutos.",
      };
    }

    if (error instanceof Error) {
      const mapped = mapGarminConnectError(error.message);

      if (mapped) {
        return mapped;
      }

      return {
        message: error.message,
      };
    }

    return {
      message: "Falha ao conectar Garmin.",
    };
  }
}

export async function syncGarminAction(): Promise<ActionState> {
  const session = await requireSession();

  try {
    await assertRateLimit(`garmin-sync:${session.user.id}`, 10, 1000 * 60 * 10);
    const result = await syncGarminForUser(session.user.id);
    const dispatchSummary = await dispatchPendingWhatsAppDeliveries({
      userId: session.user.id,
      maxMessages: 1,
      delayBetweenMessagesSeconds: 0,
    });

    revalidatePath("/app/integracoes");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/atividades");
    revalidatePath("/onboarding");

    return {
      success: true,
      message: dispatchSummary.sent > 0
        ? `${result.syncedCount} atividades sincronizadas. ${dispatchSummary.sent} relatório enviado agora.`
        : `${result.syncedCount} atividades sincronizadas.`,
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

  revalidatePath("/app/integracoes");
  revalidatePath("/app/dashboard");
  revalidatePath("/onboarding");

  return {
    success: true,
    message: "Garmin desconectada. Histórico preservado.",
  };
}

export async function saveGarminReportPreferencesAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const reportTime = normalizeReportTime(formData.get("reportTime")) ?? DEFAULT_DAILY_REPORT_TIME;

  await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    update: {
      enabled: formData.get("enabled") === "on",
      postActivityReport: formData.get("postActivityReport") === "on",
      dailySummary: formData.get("dailySummary") === "on",
      reportTime,
      timezone: DEFAULT_DAILY_REPORT_TIMEZONE,
    },
    create: {
      userId: session.user.id,
      enabled: formData.get("enabled") === "on",
      postActivityReport: formData.get("postActivityReport") === "on",
      dailySummary: formData.get("dailySummary") === "on",
      weeklySummary: false,
      reportTime,
      timezone: DEFAULT_DAILY_REPORT_TIMEZONE,
    },
  });

  revalidatePath("/app/integracoes");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/relatorios");
  revalidatePath("/onboarding");

  return {
    success: true,
    message: `Preferências salvas. Resumo diário padrão: ${reportTime} UTC.`,
  };
}

function mapGarminConnectError(message: string): ActionState | null {
  const normalized = message.trim();

  if (
    normalized.includes("GARMIN_REQUEST_TIMEOUT")
    || normalized.includes("GARMIN_CONNECT_429")
    || normalized.toLowerCase().includes("rate limited")
    || normalized.toLowerCase().includes("timeout")
  ) {
    return {
      code: "GARMIN_TEMPORARY_UNAVAILABLE",
      message:
        normalized.includes("GARMIN_CONNECT_429") || normalized.toLowerCase().includes("rate limited")
          ? "A Garmin bloqueou temporariamente novas tentativas deste IP. Aguarde alguns minutos antes de tentar conectar novamente."
          : "A Garmin demorou demais para responder. Tente conectar novamente em alguns instantes; se persistir, pode ser instabilidade na Garmin ou na API intermediária.",
    };
  }

  if (normalized.includes("GARMIN_MFA_REQUIRED") || normalized.includes("mfa")) {
    return {
      code: "GARMIN_MFA_REQUIRED",
      message:
        "Sua conta Garmin está com autenticação em duas etapas ativa. Desative o 2FA na Garmin e tente conectar novamente aqui.",
    };
  }

  if (
    normalized.includes("GARMIN_CONNECT_401") ||
    normalized.includes("GARMIN_CONNECT_403") ||
    normalized.includes("All login strategies exhausted") ||
    normalized.includes("Portal login failed") ||
    normalized.includes("Login failed")
  ) {
    return {
      code: "GARMIN_LOGIN_REQUIRED",
      message:
        "Não foi possível entrar na sua conta Garmin com estas credenciais. Verifique seu e-mail e senha. Se não lembrar, recupere sua senha Garmin. Se ainda não tiver conta, crie uma conta Garmin primeiro.",
    };
  }

  return null;
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
    logger.info("WhatsApp activation requested from UI", {
      userId: session.user.id,
      hasPhone: Boolean(user.profile.phoneE164),
    });

    await assertRateLimit(`whatsapp-activation:${session.user.id}`, 5, 1000 * 60 * 15);
    const result = await generateWhatsAppActivation(session.user.id, user.name, user.profile.phoneE164);

    logger.info("WhatsApp activation link generated from UI", {
      userId: session.user.id,
      expiresAt: result.expiresAt,
    });

    return {
      success: true,
      message: "Link de ativação gerado.",
      activationUrl: result.activationUrl,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch (error) {
    const message =
      isRateLimitError(error)
        ? "Muitas tentativas de ativação WhatsApp. Aguarde alguns minutos."
        : error instanceof Error && error.message === "EVOLUTION_INSTANCE_PHONE_UNAVAILABLE"
          ? "A confirmação pelo WhatsApp não está disponível no momento. Tente novamente em instantes."
          : error instanceof Error
            ? error.message
            : "Não foi possível gerar ativação.";

    logger.warn("WhatsApp activation request failed from UI", {
      error,
      userId: session.user.id,
    });

    return {
      message,
    };
  }
}
