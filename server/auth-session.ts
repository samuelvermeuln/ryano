import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { prisma } from "@/server/db";
import { getAuthUrl } from "@/server/env";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function getSessionCookieConfig() {
  const secure = new URL(getAuthUrl()).protocol === "https:";

  return {
    name: secure ? "__Secure-next-auth.session-token" : "next-auth.session-token",
    secure,
  };
}

export async function createDatabaseSession(userId: string) {
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: {
      sessionToken,
      userId,
      expires,
    },
  });

  const cookieStore = await cookies();
  const { name, secure } = getSessionCookieConfig();

  cookieStore.set(name, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires,
  });
}
