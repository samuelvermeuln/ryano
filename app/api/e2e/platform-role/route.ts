/**
 * SAM-80 — E2E only (never in production, like `/api/e2e/login`): gives or
 * takes the platform ADMIN role of a user, so a spec can open `/admin`
 * deterministically and check that a regular user is redirected.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/server/db";

const bodySchema = z.object({ email: z.string().email(), admin: z.boolean() });

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const { count } = await prisma.user.updateMany({ where: { email: parsed.data.email }, data: { role: parsed.data.admin ? "ADMIN" : "USER" } });
  if (count === 0) return NextResponse.json({ error: "user not found" }, { status: 404 });
  return NextResponse.json({ ok: true, admin: parsed.data.admin });
}