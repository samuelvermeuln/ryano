import type { PrismaClient } from "@prisma/client";

/**
 * Mirrors SESSION_MAX_AGE_SECONDS in server/auth-session.ts. NextAuth stores
 * only `Session.expires`, which it rewrites as the session rolls, so the last
 * time the account was seen is `expires - maxAge`.
 */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type LastAccess = {
  /** Null when the user has no session row at all (never signed in, or signed out everywhere). */
  at: Date | null;
  /** True while a non-expired session exists, i.e. the account is currently signed in somewhere. */
  hasActiveSession: boolean;
};

/**
 * Best-effort "last access" derived from the session table.
 *
 * This is an approximation, not an audit trail: sessions are deleted on sign-out
 * and pruned when they expire, so an account that signed out looks like it never
 * accessed the system. Treat a null as "unknown", never as "never used".
 */
export async function findLastAccess(
  db: Pick<PrismaClient, "session">,
  userId: string,
  now: Date = new Date(),
): Promise<LastAccess> {
  const session = await db.session.findFirst({
    where: { userId },
    select: { expires: true },
    orderBy: { expires: "desc" },
  });
  if (!session) return { at: null, hasActiveSession: false };
  return {
    at: new Date(session.expires.getTime() - SESSION_MAX_AGE_MS),
    hasActiveSession: session.expires > now,
  };
}
