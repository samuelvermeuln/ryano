import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/crypto/password";
import { createDatabaseSession } from "@/server/auth-session";

// Only available in non-production environments to support E2E testing.
// The createDatabaseSession approach is used to bypass the JWT/database
// strategy mismatch that occurs when using signIn("credentials") from
// next-auth/react with strategy: "database".
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const { email, password } = await request.json().catch(() => ({}));

  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: String(email).trim().toLowerCase() },
  });

  if (!user?.passwordHash || user.status === "BLOCKED") {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const isValid = await verifyPassword(String(password), user.passwordHash);

  if (!isValid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Creates a proper database session (opaque token) so getServerSession works.
  await createDatabaseSession(user.id);

  return NextResponse.json({ ok: true, userId: user.id });
}
