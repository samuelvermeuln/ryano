"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/server/db";
import { hashPassword } from "@/server/crypto/password";
import { assertRateLimit } from "@/server/rate-limit";
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
    assertRateLimit(rateLimitKey, 5, 1000 * 60 * 15, "signup");
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
    assertRateLimit(rateLimitKey, 5, 1000 * 60 * 15, "password-reset-request");
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

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (!user) {
    return {
      success: true,
      message: "Se existir uma conta para este email, instruções de redefinição serão disponibilizadas.",
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

  const appUrl = process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
  const exposeResetUrl = process.env.NODE_ENV !== "production";

  return {
    success: true,
    message: exposeResetUrl
      ? "Fluxo de email transacional ainda não foi configurado neste projeto. Link de redefinição disponível apenas para uso local durante desenvolvimento."
      : "Se existir uma conta para este email, instruções de redefinição serão enviadas quando o email transacional estiver configurado.",
    resetUrl: exposeResetUrl ? `${appUrl}/redefinir-senha?token=${rawToken}` : undefined,
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
    assertRateLimit(String(formData.get("token") ?? "anonymous"), 8, 1000 * 60 * 15, "password-reset-submit");
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
