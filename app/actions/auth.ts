"use server";

import { randomInt } from "node:crypto";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { prisma } from "@/server/db";
import { getPublicAppUrl, hasPasswordResetEmailEnv } from "@/server/env";
import { logger } from "@/server/logging/logger";
import { createDatabaseSession } from "@/server/auth-session";
import { hashPassword } from "@/server/crypto/password";
import { assertRateLimit } from "@/server/rate-limit";
import { sendPasswordResetEmail } from "@/server/services/password-reset-email";
import { normalizePhoneToE164 } from "@/server/utils/phone";
import { createPasswordResetAccessToken } from "@/server/utils/password-reset-access";
import { hashToken } from "@/server/utils/token";
import {
  requestPasswordResetSchema,
  resetPasswordLinkSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/server/validators/auth";

export type ActionState = {
  success?: boolean;
  message?: string;
  code?: "ACCOUNT_ALREADY_EXISTS" | "PASSWORD_RESET_CODE_SENT";
  fields?: Record<string, string>;
  resetUrl?: string;
  resetCode?: string;
  recoveryIdentifier?: string;
  resetCodeExpiresAt?: string;
};

export async function signupAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const rawCallbackUrl = String(formData.get("callbackUrl") ?? "").trim();
  // Only allow relative internal paths to prevent open-redirect attacks.
  const safeCallbackUrl = rawCallbackUrl.startsWith("/") && !rawCallbackUrl.startsWith("//") ? rawCallbackUrl : null;

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  const rateLimitKey = String(formData.get("email") ?? "anonymous").toLowerCase();

  try {
    await assertRateLimit(rateLimitKey, 5, 1000 * 60 * 15, "signup");
  } catch {
    return {
      message: "Muitas tentativas de cadastro. Aguarde alguns minutos.",
    };
  }

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      message: issue?.message ?? "Não foi possível criar conta.",
      fields: issue?.path?.[0] ? { [String(issue.path[0])]: issue.message } : undefined,
    };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (existingUser) {
    return {
      code: "ACCOUNT_ALREADY_EXISTS",
      message: "Este e-mail já está cadastrado. Entre na sua conta ou recupere sua senha.",
      fields: { email: "Este e-mail já está cadastrado." },
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  let userId: string;

  try {
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        status: "ACTIVE",
        profile: {
          create: {},
        },
        address: {
          create: {},
        },
        notificationPreference: {
          create: {},
        },
      },
      select: {
        id: true,
      },
    });

    userId = user.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        code: "ACCOUNT_ALREADY_EXISTS",
        message: "Este e-mail já está cadastrado. Entre na sua conta ou recupere sua senha.",
        fields: { email: "Este e-mail já está cadastrado." },
      };
    }

    throw error;
  }

  await createDatabaseSession(userId);
  const onboardingUrl = safeCallbackUrl
    ? `/onboarding?next=${encodeURIComponent(safeCallbackUrl)}`
    : "/onboarding";
  redirect(onboardingUrl);
}

export async function requestPasswordResetAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = requestPasswordResetSchema.safeParse({
    identifier: formData.get("identifier"),
  });

  const rateLimitKey = String(formData.get("identifier") ?? "anonymous").toLowerCase();

  try {
    await assertRateLimit(rateLimitKey, 5, 1000 * 60 * 15, "password-reset-request");
  } catch {
    return {
      message: "Muitas tentativas de recuperação. Aguarde alguns minutos.",
    };
  }

  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Informe seu e-mail ou telefone.",
    };
  }

  const rawIdentifier = parsed.data.identifier.trim();

  if (!isValidPasswordResetIdentifier(rawIdentifier)) {
    return {
      message: "Informe um e-mail ou telefone válido.",
    };
  }

  const account = await findUserForPasswordReset(rawIdentifier);

  if (!account) {
    return {
      success: true,
      code: "PASSWORD_RESET_CODE_SENT",
      recoveryIdentifier: rawIdentifier,
      message:
        "Se existir uma conta para este e-mail ou telefone, enviaremos um código e as instruções para o e-mail cadastrado. Depois, abra o e-mail, copie o código e digite-o na próxima tela para criar nova senha.",
    };
  }

  const canSendResetEmail = hasPasswordResetEmailEnv();
  const exposeResetCode = !canSendResetEmail && process.env.NODE_ENV !== "production";

  if (!canSendResetEmail && !exposeResetCode) {
    return {
      message: "Recuperação por e-mail não está configurada neste ambiente.",
    };
  }

  const { resetCode, expiresAt } = await issuePasswordResetCode(account.id);
  const accessToken = createPasswordResetAccessToken({
    identifier: rawIdentifier,
    code: resetCode,
    expiresAt,
  });
  const resetUrl = `${getPublicAppUrl()}/redefinir-senha?acesso=${encodeURIComponent(accessToken)}`;
  const prefilledResetUrl = resetUrl;

  if (canSendResetEmail) {
    try {
      await sendPasswordResetEmail({
        to: account.email,
        name: account.name,
        resetCode,
        resetPageUrl: resetUrl,
        prefilledResetPageUrl: prefilledResetUrl,
        expiresAt,
      });
    } catch (error) {
      logger.error("Failed to send password reset email", {
        error,
        userId: account.id,
        email: account.email,
      });
    }

    return {
      success: true,
      code: "PASSWORD_RESET_CODE_SENT",
      recoveryIdentifier: rawIdentifier,
      resetCodeExpiresAt: expiresAt.toISOString(),
      message:
        "Se existir uma conta para este e-mail ou telefone, enviaremos um código e as instruções para o e-mail cadastrado. Depois, abra o e-mail, copie o código e digite-o na próxima tela para criar nova senha.",
    };
  }

  return {
    success: true,
    code: "PASSWORD_RESET_CODE_SENT",
    recoveryIdentifier: rawIdentifier,
    resetCodeExpiresAt: expiresAt.toISOString(),
    message:
      "Fluxo de e-mail transacional não está configurado neste ambiente. Código e tela de redefinição disponíveis apenas para uso local durante desenvolvimento.",
    resetCode,
    resetUrl,
  };
}

export async function resetPasswordAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const legacyToken = String(formData.get("token") ?? "").trim();

  if (legacyToken) {
    const parsed = resetPasswordLinkSchema.safeParse({
      token: legacyToken,
      password: formData.get("password"),
    });

    try {
      await assertRateLimit(legacyToken, 8, 1000 * 60 * 15, "password-reset-submit");
    } catch {
      return {
        message: "Muitas tentativas de redefinição. Aguarde alguns minutos.",
      };
    }

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        message: issue?.message ?? "Não foi possível redefinir senha.",
      };
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(parsed.data.token) },
    });

    if (!resetToken || resetToken.consumedAt || resetToken.expiresAt < new Date()) {
      return {
        message: "Link inválido ou expirado. Solicite um novo código para continuar.",
      };
    }

    await consumePasswordResetToken({ userId: resetToken.userId, tokenId: resetToken.id, password: parsed.data.password });
    redirect("/entrar?senha=alterada");
  }

  const parsed = resetPasswordSchema.safeParse({
    identifier: formData.get("identifier"),
    code: formData.get("code"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  const rateLimitKey = String(formData.get("identifier") ?? "anonymous").toLowerCase();

  try {
    await assertRateLimit(rateLimitKey, 8, 1000 * 60 * 15, "password-reset-submit");
  } catch {
    return {
      message: "Muitas tentativas de redefinição. Aguarde alguns minutos.",
    };
  }

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      message: issue?.message ?? "Não foi possível redefinir senha.",
      recoveryIdentifier: String(formData.get("identifier") ?? "").trim() || undefined,
    };
  }

  if (!isValidPasswordResetIdentifier(parsed.data.identifier)) {
    return {
      message: "Informe um e-mail ou telefone válido.",
      recoveryIdentifier: parsed.data.identifier,
    };
  }

  const account = await findUserForPasswordReset(parsed.data.identifier);

  if (!account) {
    return {
      message: "Código inválido ou expirado. Solicite um novo código e tente novamente.",
      recoveryIdentifier: parsed.data.identifier,
    };
  }

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: {
      userId: account.id,
      tokenHash: hashToken(parsed.data.code),
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!resetToken) {
    return {
      message: "Código inválido ou expirado. Solicite um novo código e tente novamente.",
      recoveryIdentifier: parsed.data.identifier,
    };
  }

  await consumePasswordResetToken({ userId: resetToken.userId, tokenId: resetToken.id, password: parsed.data.password });
  redirect("/entrar?senha=alterada");
}

function isValidPasswordResetIdentifier(identifier: string) {
  const normalizedEmail = identifier.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || Boolean(normalizePhoneToE164(identifier));
}

async function findUserForPasswordReset(identifier: string) {
  const normalizedEmail = identifier.trim().toLowerCase();
  const normalizedPhone = normalizePhoneToE164(identifier);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  if (!isEmail && !normalizedPhone) {
    return null;
  }

  if (isEmail) {
    return prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
  }

  const profileMatches = await prisma.userProfile.findMany({
    where: { phoneE164: normalizedPhone! },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    take: 2,
  });

  if (profileMatches.length === 1) {
    return profileMatches[0]?.user ?? null;
  }

  if (profileMatches.length > 1) {
    return null;
  }

  const whatsappMatches = await prisma.whatsAppIdentity.findMany({
    where: { phoneE164: normalizedPhone! },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    take: 2,
  });

  if (whatsappMatches.length === 1) {
    return whatsappMatches[0]?.user ?? null;
  }

  return null;
}

async function issuePasswordResetCode(userId: string) {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 15);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const resetCode = randomInt(0, 1_000_000).toString().padStart(6, "0");

    try {
      await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: {
            userId,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            consumedAt: new Date(),
          },
        });

        await tx.passwordResetToken.create({
          data: {
            userId,
            tokenHash: hashToken(resetCode),
            expiresAt,
          },
        });
      });

      return { resetCode, expiresAt };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to generate unique password reset code.");
}

async function consumePasswordResetToken(input: {
  userId: string;
  tokenId: string;
  password: string;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: {
        passwordHash: await hashPassword(input.password),
        status: "ACTIVE",
      },
    });

    await tx.passwordResetToken.update({
      where: { id: input.tokenId },
      data: {
        consumedAt: new Date(),
      },
    });

    await tx.passwordResetToken.updateMany({
      where: {
        userId: input.userId,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });

    await tx.session.deleteMany({
      where: { userId: input.userId },
    });
  });
}
