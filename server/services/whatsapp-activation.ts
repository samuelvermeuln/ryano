import { prisma } from "@/server/db";
import { evolutionProvider } from "@/server/providers/messaging/evolution";
import { normalizePhoneToE164, toWhatsappJid } from "@/server/utils/phone";
import { generateRawToken, hashToken } from "@/server/utils/token";

const ACTIVATION_TTL_MS = 1000 * 60 * 15;

export async function generateWhatsAppActivation(userId: string, name: string | null, phone: string) {
  const normalizedPhone = normalizePhoneToE164(phone);

  if (!normalizedPhone) {
    throw new Error("INVALID_PHONE");
  }

  await prisma.whatsAppActivationToken.updateMany({
    where: {
      userId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      consumedAt: new Date(),
    },
  });

  const rawToken = generateRawToken(12);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_MS);

  await prisma.whatsAppActivationToken.create({
    data: {
      userId,
      phoneE164: normalizedPhone,
      tokenHash,
      expiresAt,
    },
  });

  const greetingName = name?.trim() || "usuário";
  const instanceStatus = await evolutionProvider.getStatus();
  const ryvanoNumber = instanceStatus.phoneE164?.replace(/\D/g, "");

  if (!instanceStatus.connected || !ryvanoNumber) {
    throw new Error("EVOLUTION_INSTANCE_PHONE_UNAVAILABLE");
  }

  const message = encodeURIComponent(`Olá, sou ${greetingName}. Código de ativação ryvano: ${rawToken}`);

  return {
    activationUrl: `https://wa.me/${ryvanoNumber}?text=${message}`,
    expiresAt,
    rawToken,
  };
}

export async function verifyWhatsAppActivation(input: {
  token: string;
  senderPhone: string;
  externalJid?: string | null;
}) {
  const senderPhone = normalizePhoneToE164(input.senderPhone);

  if (!senderPhone) {
    throw new Error("INVALID_SENDER");
  }

  const tokenHash = hashToken(input.token);
  const activation = await prisma.whatsAppActivationToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!activation || activation.consumedAt || activation.expiresAt < new Date()) {
    throw new Error("INVALID_OR_EXPIRED_TOKEN");
  }

  if (activation.phoneE164 !== senderPhone) {
    await prisma.whatsAppActivationToken.update({
      where: { id: activation.id },
      data: { attemptCount: { increment: 1 } },
    });
    throw new Error("PHONE_MISMATCH");
  }

  const consumeResult = await prisma.whatsAppActivationToken.updateMany({
    where: {
      id: activation.id,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      phoneE164: senderPhone,
    },
    data: {
      consumedAt: new Date(),
      attemptCount: { increment: 1 },
    },
  });

  if (consumeResult.count !== 1) {
    throw new Error("TOKEN_ALREADY_CONSUMED");
  }

  await prisma.whatsAppIdentity.upsert({
    where: { userId: activation.userId },
    update: {
      phoneE164: senderPhone,
      externalJid: input.externalJid ?? toWhatsappJid(senderPhone),
      verifiedAt: new Date(),
      status: "VERIFIED",
    },
    create: {
      userId: activation.userId,
      phoneE164: senderPhone,
      externalJid: input.externalJid ?? toWhatsappJid(senderPhone),
      verifiedAt: new Date(),
      status: "VERIFIED",
    },
  });

  return activation.user;
}
