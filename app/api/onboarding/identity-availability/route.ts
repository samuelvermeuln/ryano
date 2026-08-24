import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { hashCpf, normalizeCpf } from "@/server/utils/cpf";
import { normalizePhoneToE164 } from "@/server/utils/phone";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cpf = normalizeCpf(searchParams.get("cpf") ?? "");
  const phoneE164 = normalizePhoneToE164(searchParams.get("phone") ?? "");

  if (!cpf && !phoneE164) {
    return NextResponse.json({ unavailable: false, cpfUnavailable: false, phoneUnavailable: false });
  }

  const [cpfOwner, profilePhoneOwner, whatsappPhoneOwner] = await Promise.all([
    cpf
      ? prisma.userProfile.findFirst({
          where: {
            cpfHash: hashCpf(cpf),
            userId: { not: session.user.id },
          },
          select: { userId: true },
        })
      : null,
    phoneE164
      ? prisma.userProfile.findFirst({
          where: {
            phoneE164,
            userId: { not: session.user.id },
          },
          select: { userId: true },
        })
      : null,
    phoneE164
      ? prisma.whatsAppIdentity.findFirst({
          where: {
            phoneE164,
            userId: { not: session.user.id },
          },
          select: { userId: true },
        })
      : null,
  ]);

  const cpfUnavailable = Boolean(cpfOwner);
  const phoneUnavailable = Boolean(profilePhoneOwner || whatsappPhoneOwner);

  return NextResponse.json({
    unavailable: cpfUnavailable || phoneUnavailable,
    cpfUnavailable,
    phoneUnavailable,
  });
}
