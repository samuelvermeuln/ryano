import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";
import { cancelActiveWhatsAppActivation, verifyPendingWhatsAppActivationFromEvolution } from "@/server/services/whatsapp-activation";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let [identity, activeActivation] = await Promise.all([
    prisma.whatsAppIdentity.findUnique({
      where: { userId: session.user.id },
    }),
    prisma.whatsAppActivationToken.findFirst({
      where: {
        userId: session.user.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { expiresAt: true },
    }),
  ]);

  if (!identity?.verifiedAt && activeActivation) {
    try {
      const verifiedUser = await verifyPendingWhatsAppActivationFromEvolution(session.user.id);

      if (verifiedUser) {
        [identity, activeActivation] = await Promise.all([
          prisma.whatsAppIdentity.findUnique({
            where: { userId: session.user.id },
          }),
          prisma.whatsAppActivationToken.findFirst({
            where: {
              userId: session.user.id,
              consumedAt: null,
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: "desc" },
            select: { expiresAt: true },
          }),
        ]);
      }
    } catch (error) {
      logger.warn("WhatsApp activation status fallback failed", {
        error,
        userId: session.user.id,
      });
    }
  }

  return NextResponse.json({
    verified: Boolean(identity?.verifiedAt),
    phoneE164: identity?.phoneE164 ?? null,
    status: identity?.status ?? "PENDING",
    activationPending: Boolean(activeActivation),
    activationExpiresAt: activeActivation?.expiresAt.toISOString() ?? null,
  });
}

export async function DELETE() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const cancelledCount = await cancelActiveWhatsAppActivation(session.user.id);

  return NextResponse.json({
    cancelled: true,
    cancelledCount,
  });
}
