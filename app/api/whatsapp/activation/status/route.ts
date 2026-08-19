import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const identity = await prisma.whatsAppIdentity.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json({
    verified: Boolean(identity?.verifiedAt),
    phoneE164: identity?.phoneE164 ?? null,
    status: identity?.status ?? "PENDING",
  });
}
