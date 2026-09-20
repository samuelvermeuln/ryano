import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { isOnboardingComplete } from "@/server/users/onboarding";

const getCachedSession = cache(async () => auth());

const getCachedUserRecord = cache(async (userId: string) => prisma.user.findUnique({
  where: { id: userId },
  include: {
    profile: true,
    address: true,
    whatsappIdentity: true,
    notificationPreference: true,
    wearableConnections: true,
  },
}));

export async function requireSession() {
  const session = await getCachedSession();

  if (!session?.user?.id) {
    redirect("/entrar");
  }

  return session;
}

export async function requireOnboardedSession(options?: {
  /**
   * When the user hasn't finished onboarding, redirect to
   * `/onboarding?next=<nextPath>` instead of plain `/onboarding`.
   * Use this on role-specific entry points (professor, escola) so the
   * post-onboarding CTA brings them back to the right flow.
   */
  next?: string;
}) {
  const session = await requireSession();

  if (!session.user.onboardingComplete) {
    const destination =
      options?.next && options.next.startsWith("/") && !options.next.startsWith("//")
        ? `/onboarding?next=${encodeURIComponent(options.next)}`
        : "/onboarding";
    redirect(destination);
  }

  return session;
}

export async function requireUserRecord() {
  const session = await requireSession();
  const user = await getCachedUserRecord(session.user.id);

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

export function getPublicSession() {
  return raceWithFallback(auth(), null, PUBLIC_AUTH_TIMEOUT_MS);
}

export async function redirectIfAuthenticated() {
  const session = await auth();
  const target = getAuthenticatedRedirectPath(session);

  if (target) {
    redirect(target);
  }
}
