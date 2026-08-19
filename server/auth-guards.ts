import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { isOnboardingComplete } from "@/server/users/onboarding";

export async function requireSession() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/entrar");
  }

  return session;
}

export async function requireUserRecord() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      profile: true,
      address: true,
      whatsappIdentity: true,
      notificationPreference: true,
      wearableConnections: true,
    },
  });

  if (!user) {
    redirect("/entrar");
  }

  return user;
}

export async function requireOnboardedUser() {
  const user = await requireUserRecord();

  if (!isOnboardingComplete(user)) {
    redirect("/onboarding");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireUserRecord();

  if (user.role !== "ADMIN") {
    redirect("/app/dashboard");
  }

  return user;
}
