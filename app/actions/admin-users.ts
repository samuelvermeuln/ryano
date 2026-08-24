"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/server/auth-guards";
import { encryptSecret } from "@/server/crypto/secret-vault";
import { prisma } from "@/server/db";
import { assertRateLimit } from "@/server/rate-limit";
import { hashCpf, normalizeCpf } from "@/server/utils/cpf";
import { normalizePhoneToE164 } from "@/server/utils/phone";
import { adminUserIdentitySchema } from "@/server/validators/profile";

export type AdminUserActionState = {
  success?: boolean;
  message?: string;
};

export async function updateAdminUserIdentityAction(
  userId: string,
  _previousState: AdminUserActionState,
  formData: FormData,
): Promise<AdminUserActionState> {
  const admin = await requireAdmin();
  await assertRateLimit(admin.id, 20, 1000 * 60 * 10, "admin-user-identity-update");

  const parsed = adminUserIdentitySchema.safeParse({
    cpf: formData.get("cpf"),
    phone: formData.get("phone"),
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      whatsappIdentity: true,
    },
  });

  if (!user) {
    return { message: "Usuário não encontrado." };
  }

  const [existingCpfOwner, existingPhoneProfileOwner, existingWhatsAppOwner] = await Promise.all([
    prisma.userProfile.findFirst({
      where: {
        cpfHash: hashCpf(cpf),
        userId: { not: userId },
      },
      select: { userId: true },
    }),
    prisma.userProfile.findFirst({
      where: {
        phoneE164,
        userId: { not: userId },
      },
      select: { userId: true },
    }),
    prisma.whatsAppIdentity.findFirst({
      where: {
        phoneE164,
        userId: { not: userId },
      },
      select: { userId: true },
    }),
  ]);

  if (existingCpfOwner) {
    return { message: "CPF já está vinculado a outro cliente." };
  }

  if (existingPhoneProfileOwner || existingWhatsAppOwner) {
    return { message: "Telefone já está vinculado a outro cliente." };
  }

  const cpfEncrypted = JSON.stringify(encryptSecret(cpf));
  const phoneChanged = user.profile?.phoneE164 !== phoneE164;
  const cpfChanged = user.profile?.cpfHash !== hashCpf(cpf);

  await prisma.$transaction(async (tx) => {
    await tx.userProfile.upsert({
      where: { userId },
      update: {
        cpfEncrypted,
        cpfHash: hashCpf(cpf),
        phoneE164,
      },
      create: {
        userId,
        cpfEncrypted,
        cpfHash: hashCpf(cpf),
        phoneE164,
      },
    });

    if (user.whatsappIdentity && phoneChanged) {
      await tx.whatsAppIdentity.update({
        where: { userId },
        data: {
          phoneE164,
          status: "PENDING_REVALIDATION",
          verifiedAt: null,
        },
      });
    }

    await tx.adminAuditLog.create({
      data: {
        actorUserId: admin.id,
        targetUserId: userId,
        action: "ADMIN_USER_IDENTITY_UPDATE",
        entityType: "USER_PROFILE",
        entityId: user.profile?.id ?? userId,
        metadata: {
          cpfChanged,
          phoneChanged,
        },
      },
    });
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${userId}`);
  revalidatePath("/app/perfil");
  revalidatePath("/app/integracoes");
  revalidatePath("/onboarding");

  return {
    success: true,
    message: phoneChanged
      ? "CPF e telefone atualizados. WhatsApp voltou para pendente e precisa ser revalidado."
      : "CPF e telefone atualizados.",
  };
}
