"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";
import { evolutionProvider } from "@/server/providers/messaging/evolution";
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
  recoveryUrl?: string;
  code?: "GARMIN_ACCOUNT_LOCKED" | "GARMIN_LOGIN_REQUIRED" | "GARMIN_MFA_REQUIRED" | "GARMIN_TEMPORARY_UNAVAILABLE";
};

const GARMIN_RECOVER_PASSWORD_URL =
  process.env.NEXT_PUBLIC_GARMIN_RECOVER_PASSWORD_URL ||
  "https://sso.garmin.com/portal/sso/en-US/forgot-password?service=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F";

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
    logger.warn("Garmin connect form validation failed", {
      userId: session.user.id,
      issues: parsed.error.issues.map((issue) => issue.message),
    });

    return { message: parsed.error.issues[0]?.message ?? "Dados Garmin inválidos." };
  }

  try {
    logger.info("Garmin connect action started", {
      userId: session.user.id,
      emailDomain: getEmailDomain(parsed.data.email),
    });

    await assertRateLimit(`garmin-connect:${session.user.id}`, 5, 1000 * 60 * 10);
    const connection = await connectGarminForUser({
      userId: session.user.id,
      email: parsed.data.email,
      password: parsed.data.password,
      label: `ryvano-${session.user.id}`,
    });

    logger.info("Garmin connect action succeeded", {
      userId: session.user.id,
      connectionId: connection.id,
      status: connection.status,
      lastSyncStatus: connection.lastSyncStatus,
    });

    let initialSyncMessage = "";

    try {
      const syncResult = await syncGarminForUser(session.user.id, {
        postActivityReportMode: "latest-recent-new",
      });
      const dispatchSummary = await dispatchPendingWhatsAppDeliveries({
        userId: session.user.id,
        maxMessages: 1,
        delayBetweenMessagesSeconds: 0,
      });

      logger.info("Garmin initial sync after connect succeeded", {
        userId: session.user.id,
        syncedCount: syncResult.syncedCount,
        createdCount: syncResult.createdCount,
        latestActivityExternalId: syncResult.latestActivityExternalId,
        postActivityReportQueued: syncResult.postActivityReportQueued,
        sentMessages: dispatchSummary.sent,
      });

      initialSyncMessage = dispatchSummary.sent > 0
        ? `${syncResult.createdCount} atividades novas importadas e ${dispatchSummary.sent} relatório enviado no WhatsApp.`
        : `${syncResult.createdCount} atividades novas importadas.`;
    } catch (syncError) {
      logger.warn("Garmin initial sync after connect failed", {
        error: syncError,
        userId: session.user.id,
      });

      initialSyncMessage = "Conexão salva, mas a sincronização inicial não completou. A próxima verificação automática tentará novamente.";
    }

    revalidatePath("/app/integracoes");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/atividades");
    revalidatePath("/onboarding");

    return {
      success: true,
      message: initialSyncMessage
        ? `Garmin conectada com sucesso. ${initialSyncMessage}`
        : "Garmin conectada com sucesso.",
    };
  } catch (error) {
    if (isRateLimitError(error)) {
      logger.warn("Garmin connect action blocked by app rate limit", {
        userId: session.user.id,
      });

      return {
        message: "Muitas tentativas de conexão Garmin. Aguarde alguns minutos.",
      };
    }

    if (error instanceof Error) {
      logger.warn("Garmin connect action failed", {
        error,
        userId: session.user.id,
      });

      const mapped = mapGarminConnectError(error.message);

      if (mapped) {
        return mapped;
      }

      return {
        message: "Não foi possível conectar sua conta Garmin agora. Tente novamente em instantes.",
      };
    }

    return {
      message: "Falha ao conectar Garmin.",
    };
  }
}

function getEmailDomain(email: string) {
  const [, domain] = email.trim().split("@");
  return domain?.toLowerCase() ?? null;
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
          ? mapGarminSyncErrorMessage(error.message)
          : "Não conseguimos atualizar agora. Tentaremos novamente automaticamente.",
    };
  }
}

export async function disconnectGarminAction(): Promise<ActionState> {
  const session = await requireSession();

  try {
    await disconnectGarminForUser(session.user.id);

    revalidatePath("/app/integracoes");
    revalidatePath("/app/dashboard");
    revalidatePath("/onboarding");

    return {
      success: true,
      message: "Garmin desconectada. Histórico preservado.",
    };
  } catch (error) {
    logger.warn("Garmin disconnect action failed", {
      error,
      userId: session.user.id,
    });

    return {
      message: "Não foi possível desconectar a Garmin agora. Tente novamente em instantes.",
    };
  }
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
  const lower = normalized.toLowerCase();

  if (isGarminAccountLockedMessage(lower)) {
    return {
      code: "GARMIN_ACCOUNT_LOCKED",
      recoveryUrl: GARMIN_RECOVER_PASSWORD_URL,
      message:
        "A Garmin informou que esta conta foi bloqueada. Para liberar o acesso, recupere sua senha no site da Garmin e depois volte aqui para conectar novamente.",
    };
  }

  if (
    normalized.includes("GARMIN_REQUEST_TIMEOUT")
    || normalized.includes("GARMIN_CONNECT_429")
    || lower.includes("rate limited")
    || lower.includes("timeout")
  ) {
    return {
      code: "GARMIN_TEMPORARY_UNAVAILABLE",
      message:
        normalized.includes("GARMIN_CONNECT_429") || lower.includes("rate limited")
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

function isGarminAccountLockedMessage(message: string) {
  return (
    message.includes("garmin_account_locked") ||
    message.includes("account locked") ||
    message.includes("account is locked") ||
    message.includes("account has been locked") ||
    message.includes("locked account") ||
    message.includes("temporarily locked") ||
    message.includes("password reset required") ||
    message.includes("reset your password") ||
    message.includes("recover password") ||
    (message.includes("locked") && (message.includes("account") || message.includes("password"))) ||
    (message.includes("bloquead") && (message.includes("conta") || message.includes("senha")))
  );
}

export async function generateWhatsAppActivationAction(): Promise<ActionState> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      profile: true,
      whatsappIdentity: true,
    },
  });

  if (!user) {
    return {
      message: "Usuário não encontrado.",
    };
  }

  const phone = user.whatsappIdentity?.phoneE164 ?? user.profile?.phoneE164 ?? null;

  if (!phone) {
    return {
      message: "Complete telefone no perfil antes de ativar WhatsApp.",
    };
  }

  try {
    logger.info("WhatsApp activation requested from UI", {
      userId: session.user.id,
      hasPhone: Boolean(phone),
    });

    await assertRateLimit(`whatsapp-activation:${session.user.id}`, 5, 1000 * 60 * 15);
    const result = await generateWhatsAppActivation(session.user.id, user.name, phone);

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
          : "Não foi possível iniciar a confirmação do WhatsApp agora. Tente novamente em instantes.";

    logger.warn("WhatsApp activation request failed from UI", {
      error,
      userId: session.user.id,
    });

    return {
      message,
    };
  }
}

export async function sendWhatsAppTestMessageAction(): Promise<ActionState> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      profile: true,
      whatsappIdentity: true,
    },
  });

  const phone = user?.whatsappIdentity?.phoneE164 ?? user?.profile?.phoneE164 ?? null;

  if (!phone) {
    return {
      message: "Adicione um telefone no seu perfil antes de continuar.",
    };
  }

  if (!user?.whatsappIdentity?.verifiedAt) {
    return {
      message: "Confirme seu número no WhatsApp antes de enviar um teste.",
    };
  }

  try {
    await assertRateLimit(`whatsapp-test:${session.user.id}`, 5, 1000 * 60 * 10);
    const result = await evolutionProvider.sendText({
      to: phone,
      text: "Teste RYVANO ✅\nSua integração com o WhatsApp está funcionando.",
    });

    if (result.status !== "sent") {
      return {
        message: "Não foi possível enviar a mensagem de teste agora. Tente novamente em instantes.",
      };
    }

    return {
      success: true,
      message: "Mensagem de teste enviada no seu WhatsApp.",
    };
  } catch (error) {
    logger.warn("WhatsApp test message request failed from integrations UI", {
      error,
      userId: session.user.id,
    });

    return {
      message: isRateLimitError(error)
        ? "Muitas tentativas de envio. Aguarde alguns minutos."
        : "Não foi possível enviar a mensagem de teste agora. Tente novamente em instantes.",
    };
  }
}

function mapGarminSyncErrorMessage(message: string) {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  if (
    normalized.includes("GARMIN_CONNECT_429")
    || normalized.includes("GARMIN_SYNC_429")
    || lower.includes("rate limited")
  ) {
    return "A Garmin recusou temporariamente uma nova tentativa de sincronização. Sua conexão continua ativa e tentaremos novamente automaticamente.";
  }

  if (
    normalized.includes("GARMIN_CONNECT_401")
    || normalized.includes("GARMIN_CONNECT_403")
    || normalized.includes("GARMIN_LOGIN_REQUIRED")
    || normalized.includes("GARMIN_MFA_REQUIRED")
    || normalized.includes("All login strategies exhausted")
    || normalized.includes("Portal login failed")
    || normalized.includes("Login failed")
    || normalized.includes("GARMIN_NOT_CONNECTED")
  ) {
    return "Sua conexão com a Garmin precisa ser validada novamente para continuar sincronizando.";
  }

  if (lower.includes("timeout") || lower.includes("non-json")) {
    return "A Garmin não respondeu como esperado agora. Seus dados continuam salvos e tentaremos novamente em breve.";
  }

  return "Não conseguimos atualizar agora. Sua conexão continua ativa e tentaremos novamente automaticamente.";
}
