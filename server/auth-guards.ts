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

export function getAuthenticatedRedirectPath(session: Awaited<ReturnType<typeof auth>>) {
  if (!session?.user?.id) {
    return null;
  }

  if (session.user.role === "ADMIN") {
    return "/admin";
  }

  if (!session.user.onboardingComplete) {
    return "/onboarding";
  }

  return "/app/dashboard";
}

const PUBLIC_AUTH_TIMEOUT_MS = 300;

function raceWithFallback<T>(promise: Promise<T>, fallback: T, timeoutMs: number) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

export async function getAuthenticatedAppHref() {
  const session = await auth();
  return getAuthenticatedRedirectPath(session);
}

export function getPublicAuthenticatedAppHref() {
  return raceWithFallback(getAuthenticatedAppHref(), null, PUBLIC_AUTH_TIMEOUT_MS);
}

export async function redirectIfAuthenticated() {
  const target = await getPublicAuthenticatedAppHref();

  if (target) {
    redirect(target);
  }
}
