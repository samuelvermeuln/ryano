"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/server/db";
import { requireSession } from "@/server/auth-guards";
import {
  changePasswordSchema,
  onboardingAccountSchema,
  onboardingProfileSchema,
  profileDetailsSchema,
  profilePreferencesSchema,
} from "@/server/validators/profile";
import { normalizeCpf, hashCpf } from "@/server/utils/cpf";
import { normalizePhoneToE164 } from "@/server/utils/phone";
import { encryptSecret } from "@/server/crypto/secret-vault";
import { hashPassword, verifyPassword } from "@/server/crypto/password";
import { isOnboardingComplete } from "@/server/users/onboarding";
import { DEFAULT_DAILY_REPORT_TIME, DEFAULT_DAILY_REPORT_TIMEZONE, normalizeReportTime, normalizeTimezone } from "@/server/services/reporting";
import { getHttpClient } from "@/lib/http-client";

export type ActionState = {
  success?: boolean;
  message?: string;
  code?: "EXISTING_ACCOUNT_DATA";
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
      postalCode: formData.get("postalCode"),
      number: formData.get("number"),
      complement: formData.get("complement"),
    });

    if (!parsed.success) {
      return { message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }

    const cpf = normalizeCpf(parsed.data.cpf);
    const phoneE164 = normalizePhoneToE164(parsed.data.phone);
    const postalCode = parsed.data.postalCode.replace(/\D/g, "");

    if (!cpf) {
      return { message: "CPF inválido." };
    }

    if (!phoneE164) {
      return { message: "Telefone inválido." };
    }

    if (postalCode.length !== 8) {
      return { message: "CEP inválido." };
    }

    const addressLookup = await lookupAddressByPostalCode(postalCode);

    if (!addressLookup) {
      return { message: "CEP não encontrado." };
    }

    const currentIdentity = await prisma.whatsAppIdentity.findUnique({
      where: { userId: session.user.id },
    });

    const [existingCpfOwner, existingPhoneProfileOwner, existingWhatsAppOwner] = await Promise.all([
      prisma.userProfile.findFirst({
        where: {
          cpfHash: hashCpf(cpf),
          userId: { not: session.user.id },
        },
        select: { userId: true },
      }),
      prisma.userProfile.findFirst({
        where: {
          phoneE164,
          userId: { not: session.user.id },
        },
        select: { userId: true },
      }),
      prisma.whatsAppIdentity.findFirst({
        where: {
          phoneE164,
          userId: { not: session.user.id },
        },
        select: { userId: true },
      }),
    ]);

    if (existingCpfOwner || existingPhoneProfileOwner || existingWhatsAppOwner) {
      return {
        code: "EXISTING_ACCOUNT_DATA",
        message:
          "Os dados informados já estão vinculados a uma conta existente. Por segurança e privacidade, não podemos informar qual conta é essa. Para continuar, entre com a conta correta.",
      };
    }

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

    try {
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
          address: {
            upsert: {
              update: {
                postalCode,
                street: addressLookup.street,
                number: parsed.data.number,
                complement: parsed.data.complement || null,
                district: addressLookup.district,
                city: addressLookup.city,
                state: addressLookup.state,
                country: addressLookup.country,
              },
              create: {
                postalCode,
                street: addressLookup.street,
                number: parsed.data.number,
                complement: parsed.data.complement || null,
                district: addressLookup.district,
                city: addressLookup.city,
                state: addressLookup.state,
                country: addressLookup.country,
              },
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        Array.isArray(error.meta?.target) &&
        error.meta.target.includes("cpfHash")
      ) {
        return {
          code: "EXISTING_ACCOUNT_DATA",
          message:
            "Os dados informados já estão vinculados a uma conta existente. Por segurança e privacidade, não podemos informar qual conta é essa. Para continuar, entre com a conta correta.",
        };
      }

      throw error;
    }

    await refreshOnboardingState(session.user.id);
    revalidatePath("/onboarding");

    return { success: true, message: "Perfil salvo." };
  }

  return { message: "Etapa inválida." };
}

async function lookupAddressByPostalCode(postalCode: string) {
  try {
    const response = await getHttpClient().request<{
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    }>({
      url: `https://viacep.com.br/ws/${postalCode}/json/`,
    });

    const payload = response.data;

    if (
      response.status < 200 ||
      response.status >= 300 ||
      payload.erro ||
      !payload.logradouro ||
      !payload.bairro ||
      !payload.localidade ||
      !payload.uf
    ) {
      return null;
    }

    return {
      street: payload.logradouro,
      district: payload.bairro,
      city: payload.localidade,
      state: payload.uf,
      country: "Brasil",
    };
  } catch {
    return null;
  }
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

export async function saveProfileDetailsAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = profileDetailsSchema.safeParse({
    name: formData.get("name"),
    heightCm: formData.get("heightCm"),
    weightKg: formData.get("weightKg"),
    postalCode: formData.get("postalCode"),
    number: formData.get("number"),
    complement: formData.get("complement"),
  });

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Não foi possível salvar suas alterações. Tente novamente." };
  }

  const postalCode = parsed.data.postalCode.replace(/\D/g, "");

  if (postalCode.length !== 8) {
    return { message: "Não encontramos este CEP. Confira os números informados." };
  }

  const addressLookup = await lookupAddressByPostalCode(postalCode);

  if (!addressLookup) {
    return { message: "Não encontramos este CEP. Confira os números informados." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: parsed.data.name,
      profile: {
        upsert: {
          update: {
            heightCm: parsed.data.heightCm,
            weightKg: parsed.data.weightKg,
          },
          create: {
            heightCm: parsed.data.heightCm,
            weightKg: parsed.data.weightKg,
          },
        },
      },
      address: {
        upsert: {
          update: {
            postalCode,
            street: addressLookup.street,
            number: parsed.data.number,
            complement: parsed.data.complement || null,
            district: addressLookup.district,
            city: addressLookup.city,
            state: addressLookup.state,
            country: addressLookup.country,
          },
          create: {
            postalCode,
            street: addressLookup.street,
            number: parsed.data.number,
            complement: parsed.data.complement || null,
            district: addressLookup.district,
            city: addressLookup.city,
            state: addressLookup.state,
            country: addressLookup.country,
          },
        },
      },
    },
  });

  revalidatePath("/app/perfil");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/integracoes");

  return { success: true, message: "Perfil atualizado com sucesso." };
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

  const reportTime = normalizeReportTime(parsed.data.reportTime) ?? DEFAULT_DAILY_REPORT_TIME;
  const timezone = normalizeTimezone(parsed.data.timezone) ?? DEFAULT_DAILY_REPORT_TIMEZONE;

  await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    update: {
      ...parsed.data,
      reportTime,
      timezone,
    },
    create: {
      userId: session.user.id,
      ...parsed.data,
      reportTime,
      timezone,
    },
  });

  revalidatePath("/app/relatorios");
  revalidatePath("/app/integracoes");
  revalidatePath("/app/dashboard");

  return { success: true, message: `Preferências salvas. Resumo diário padrão: ${reportTime} ${timezone}.` };
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
