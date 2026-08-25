import { logger } from "@/server/logging/logger";
import { prisma } from "@/server/db";
import { evolutionProvider } from "@/server/providers/messaging/evolution";
import { normalizePhoneToE164, toWhatsappJid } from "@/server/utils/phone";
import { generateRawToken, hashToken } from "@/server/utils/token";

const ACTIVATION_TTL_MS = 1000 * 60 * 15;

export async function generateWhatsAppActivation(userId: string, name: string | null, phone: string) {
  const normalizedPhone = normalizePhoneToE164(phone);

  if (!normalizedPhone) {
    logger.warn("WhatsApp activation aborted: invalid phone", { userId });
    throw new Error("INVALID_PHONE");
  }

  logger.info("Generating WhatsApp activation", {
    userId,
    phoneMasked: maskPhone(normalizedPhone),
  });

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

  const activation = await prisma.whatsAppActivationToken.create({
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
    logger.warn("WhatsApp activation unavailable: Evolution instance phone missing", {
      userId,
      activationId: activation.id,
      evolutionConnected: instanceStatus.connected,
      evolutionPhoneMasked: maskPhone(instanceStatus.phoneE164),
    });
    throw new Error("EVOLUTION_INSTANCE_PHONE_UNAVAILABLE");
  }

  const message = encodeURIComponent(`Olá, sou ${greetingName}. Código de ativação ryvano: ${rawToken}`);

  logger.info("WhatsApp activation ready", {
    userId,
    activationId: activation.id,
    phoneMasked: maskPhone(normalizedPhone),
    evolutionPhoneMasked: maskPhone(instanceStatus.phoneE164),
    expiresAt,
  });

  return {
    activationUrl: `https://wa.me/${ryvanoNumber}?text=${message}`,
    expiresAt,
    rawToken,
  };
}

export async function cancelActiveWhatsAppActivation(userId: string) {
  const result = await prisma.whatsAppActivationToken.updateMany({
    where: {
      userId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      consumedAt: new Date(),
    },
  });

  logger.info("WhatsApp activation cancelled", {
    userId,
    cancelledCount: result.count,
  });

  return result.count;
}

export async function verifyPendingWhatsAppActivationFromEvolution(userId: string) {
  const activation = await prisma.whatsAppActivationToken.findFirst({
    where: {
      userId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!activation) {
    return null;
  }

  const messages = await evolutionProvider.findIncomingMessages({
    phoneE164: activation.phoneE164,
    since: activation.createdAt,
    until: activation.expiresAt,
  });

  for (const message of messages) {
    const token = extractWhatsAppActivationToken(message.text);

    if (!token) {
      continue;
    }

    try {
      return await verifyWhatsAppActivation({
        token,
        senderPhone: message.senderPhone ?? activation.phoneE164,
        externalJid: message.externalJid ?? toWhatsappJid(activation.phoneE164),
      });
    } catch (error) {
      logger.warn("WhatsApp activation fallback candidate rejected", {
        error,
        userId,
        activationId: activation.id,
        senderPhoneMasked: maskPhone(message.senderPhone),
        externalJid: message.externalJid,
        activationCodeLength: token.length,
      });
    }
  }

  return null;
}

export async function verifyWhatsAppActivation(input: {
  token: string;
  senderPhone: string;
  externalJid?: string | null;
}) {
  const senderPhone = normalizePhoneToE164(input.senderPhone);

  if (!senderPhone) {
    logger.warn("WhatsApp activation verification failed: invalid sender", {
      senderRaw: input.senderPhone,
      externalJid: input.externalJid,
    });
    throw new Error("INVALID_SENDER");
  }

  const tokenHash = hashToken(input.token);
  const activation = await prisma.whatsAppActivationToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!activation || activation.consumedAt || activation.expiresAt < new Date()) {
    logger.warn("WhatsApp activation verification failed: invalid or expired activation", {
      activationFound: Boolean(activation),
      activationId: activation?.id ?? null,
      activationConsumedAt: activation?.consumedAt ?? null,
      activationExpiresAt: activation?.expiresAt ?? null,
      senderPhoneMasked: maskPhone(senderPhone),
      externalJid: input.externalJid,
      activationCodeLength: input.token.length,
    });
    throw new Error("INVALID_OR_EXPIRED_TOKEN");
  }

  if (activation.phoneE164 !== senderPhone) {
    await prisma.whatsAppActivationToken.update({
      where: { id: activation.id },
      data: { attemptCount: { increment: 1 } },
    });

    logger.warn("WhatsApp activation verification failed: phone mismatch", {
      activationId: activation.id,
      userId: activation.userId,
      expectedPhoneMasked: maskPhone(activation.phoneE164),
      senderPhoneMasked: maskPhone(senderPhone),
      externalJid: input.externalJid,
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
    logger.warn("WhatsApp activation verification failed: activation already consumed", {
      activationId: activation.id,
      userId: activation.userId,
      senderPhoneMasked: maskPhone(senderPhone),
      externalJid: input.externalJid,
    });
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

  logger.info("WhatsApp activation verified successfully", {
    activationId: activation.id,
    userId: activation.userId,
    senderPhoneMasked: maskPhone(senderPhone),
    externalJid: input.externalJid,
  });

  return activation.user;
}

export function extractWhatsAppActivationToken(text: string) {
  const match = text.match(/[A-Fa-f0-9]{24,}/);
  return match?.[0] ?? null;
}

function maskPhone(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\D/g, "");

  if (normalized.length <= 4) {
    return `***${normalized}`;
  }

  return `+${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}
