"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/server/db";
import { getPublicAppUrl, hasPasswordResetEmailEnv } from "@/server/env";
import { logger } from "@/server/logging/logger";
import { hashPassword } from "@/server/crypto/password";
import { assertRateLimit } from "@/server/rate-limit";
import { sendPasswordResetEmail } from "@/server/services/password-reset-email";
import { hashToken } from "@/server/utils/token";
import {
  requestPasswordResetSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/server/validators/auth";

export type ActionState = {
  success?: boolean;
  message?: string;
  fields?: Record<string, string>;
  resetUrl?: string;
};

export async function signupAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
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
      message: "Já existe uma conta com este email.",
      fields: { email: "Email já cadastrado." },
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.user.create({
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
  });

  return {
    success: true,
    message: "Conta criada. Faça login para continuar.",
  };
}

export async function requestPasswordResetAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = requestPasswordResetSchema.safeParse({
    email: formData.get("email"),
  });

  const rateLimitKey = String(formData.get("email") ?? "anonymous").toLowerCase();

  try {
    await assertRateLimit(rateLimitKey, 5, 1000 * 60 * 15, "password-reset-request");
  } catch {
    return {
      message: "Muitas tentativas de recuperação. Aguarde alguns minutos.",
    };
  }

  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Email inválido.",
    };
  }

  const canSendResetEmail = hasPasswordResetEmailEnv();
  const exposeResetUrl = !canSendResetEmail && process.env.NODE_ENV !== "production";

  if (!canSendResetEmail && !exposeResetUrl) {
    return {
      message: "Recuperação por email não está configurada neste ambiente.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (!user) {
    return {
      success: true,
      message: canSendResetEmail
        ? "Se existir uma conta para este email, enviaremos instruções de redefinição."
        : "Se existir uma conta para este email, um link de redefinição será disponibilizado apenas neste ambiente de desenvolvimento.",
    };
  }

  const rawToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        consumedAt: new Date(),
      },
    });

    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });
  });

  const resetUrl = `${getPublicAppUrl()}/redefinir-senha?token=${rawToken}`;

  if (canSendResetEmail) {
    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
        expiresAt,
      });
    } catch (error) {
      logger.error("Failed to send password reset email", {
        error,
        userId: user.id,
        email: user.email,
      });
    }

    return {
      success: true,
      message: "Se existir uma conta para este email, enviaremos instruções de redefinição.",
    };
  }

  return {
    success: true,
    message: "Fluxo de email transacional não está configurado neste ambiente. Link de redefinição disponível apenas para uso local durante desenvolvimento.",
    resetUrl,
  };
}

export async function resetPasswordAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  try {
    await assertRateLimit(String(formData.get("token") ?? "anonymous"), 8, 1000 * 60 * 15, "password-reset-submit");
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

  const tokenHash = hashToken(parsed.data.token);
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!resetToken || resetToken.consumedAt || resetToken.expiresAt < new Date()) {
    return {
      message: "Token inválido ou expirado.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash: await hashPassword(parsed.data.password),
        status: "ACTIVE",
      },
    });

    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: {
        consumedAt: new Date(),
      },
    });

    await tx.passwordResetToken.updateMany({
      where: {
        userId: resetToken.userId,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });

    await tx.session.deleteMany({
      where: { userId: resetToken.userId },
    });
  });

  redirect("/entrar?senha=alterada");
}
