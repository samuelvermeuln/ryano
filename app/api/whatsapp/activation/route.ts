import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertRateLimit } from "@/server/rate-limit";
import { generateWhatsAppActivation } from "@/server/services/whatsapp-activation";

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { profile: true },
  });

  if (!user?.profile?.phoneE164) {
    return NextResponse.json({ error: "PHONE_REQUIRED" }, { status: 400 });
  }

  try {
    assertRateLimit(`api-whatsapp-activation:${session.user.id}`, 5, 1000 * 60 * 15);
    const result = await generateWhatsAppActivation(session.user.id, user.name, user.profile.phoneE164);

    return NextResponse.json({
      activationUrl: result.activationUrl,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ACTIVATION_FAILED" },
      { status: 400 },
    );
  }
}
