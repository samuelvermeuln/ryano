"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/server/db";
import { requireSession } from "@/server/auth-guards";
import {
  changePasswordSchema,
  onboardingAccountSchema,
  onboardingAddressSchema,
  onboardingProfileSchema,
  profilePreferencesSchema,
} from "@/server/validators/profile";
import { normalizeCpf, hashCpf } from "@/server/utils/cpf";
import { normalizePhoneToE164 } from "@/server/utils/phone";
import { encryptSecret } from "@/server/crypto/secret-vault";
import { hashPassword, verifyPassword } from "@/server/crypto/password";
import { isOnboardingComplete } from "@/server/users/onboarding";

export type ActionState = {
  success?: boolean;
  message?: string;
};

export async function saveOnboardingAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const stepId = String(formData.get("stepId") ?? "step-1");

  if (stepId === "step-1") {
    const parsed = onboardingAccountSchema.safeParse({
      name: formData.get("name"),
    });

    if (!parsed.success) {
      return { message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: parsed.data.name,
      },
    });

    await refreshOnboardingState(session.user.id);
    revalidatePath("/onboarding");

    return { success: true, message: "Dados da conta salvos." };
  }

  if (stepId === "step-2") {
    const parsed = onboardingProfileSchema.safeParse({
      cpf: formData.get("cpf"),
      phone: formData.get("phone"),
      heightCm: formData.get("heightCm"),
      weightKg: formData.get("weightKg"),
    });

    if (!parsed.success) {
      return { message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }

    const cpf = normalizeCpf(parsed.data.cpf);
    const phoneE164 = normalizePhoneToE164(parsed.data.phone);

    if (!cpf) {
      return { message: "CPF inválido." };
    }

    if (!phoneE164) {
      return { message: "Telefone inválido." };
    }

    const currentIdentity = await prisma.whatsAppIdentity.findUnique({
      where: { userId: session.user.id },
    });

    if (currentIdentity && currentIdentity.phoneE164 !== phoneE164) {
      await prisma.whatsAppIdentity.update({
        where: { userId: session.user.id },
        data: {
          phoneE164,
          status: "PENDING_REVALIDATION",
          verifiedAt: null,
        },
      });
    }

    const encryptedCpf = JSON.stringify(encryptSecret(cpf));

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        profile: {
          upsert: {
            update: {
              cpfEncrypted: encryptedCpf,
              cpfHash: hashCpf(cpf),
              phoneE164,
              heightCm: parsed.data.heightCm,
              weightKg: parsed.data.weightKg,
            },
            create: {
              cpfEncrypted: encryptedCpf,
              cpfHash: hashCpf(cpf),
              phoneE164,
              heightCm: parsed.data.heightCm,
              weightKg: parsed.data.weightKg,
            },
          },
        },
      },
    });

    await refreshOnboardingState(session.user.id);
    revalidatePath("/onboarding");

    return { success: true, message: "Dados pessoais salvos." };
  }

  if (stepId === "step-3") {
    const parsed = onboardingAddressSchema.safeParse({
      postalCode: formData.get("postalCode"),
      street: formData.get("street"),
      number: formData.get("number"),
      complement: formData.get("complement"),
      district: formData.get("district"),
      city: formData.get("city"),
      state: formData.get("state"),
      country: formData.get("country"),
    });

    if (!parsed.success) {
      return { message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        address: {
          upsert: {
            update: {
              postalCode: parsed.data.postalCode,
              street: parsed.data.street,
              number: parsed.data.number,
              complement: parsed.data.complement || null,
              district: parsed.data.district,
              city: parsed.data.city,
              state: parsed.data.state,
              country: parsed.data.country,
            },
            create: {
              postalCode: parsed.data.postalCode,
              street: parsed.data.street,
              number: parsed.data.number,
              complement: parsed.data.complement || null,
              district: parsed.data.district,
              city: parsed.data.city,
              state: parsed.data.state,
              country: parsed.data.country,
            },
          },
        },
      },
    });

    await refreshOnboardingState(session.user.id);
    revalidatePath("/onboarding");

    return { success: true, message: "Endereço salvo." };
  }

  return { message: "Etapa inválida." };
}

async function refreshOnboardingState(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      address: true,
    },
  });

  if (!user) {
    return;
  }

  if (!isOnboardingComplete(user)) {
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      status: "ACTIVE",
      profile: {
        update: {
          onboardingCompletedAt: user.profile?.onboardingCompletedAt ?? new Date(),
        },
      },
    },
  });
}

export async function savePreferencesAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = profilePreferencesSchema.safeParse({
    postActivityReport: formData.get("postActivityReport") === "on",
    dailySummary: formData.get("dailySummary") === "on",
    weeklySummary: formData.get("weeklySummary") === "on",
    enabled: formData.get("enabled") === "on",
    reportTime: formData.get("reportTime"),
    timezone: formData.get("timezone"),
  });

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Preferências inválidas." };
  }

  await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    update: parsed.data,
    create: {
      userId: session.user.id,
      ...parsed.data,
    },
  });

  return { success: true, message: "Preferências salvas." };
}

export async function changePasswordAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Senha inválida." };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return { message: "Usuário não encontrado." };
  }

  if (user.passwordHash) {
    const currentValid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);

    if (!currentValid) {
      return { message: "Senha atual incorreta." };
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
    },
  });

  return { success: true, message: "Senha atualizada." };
}
