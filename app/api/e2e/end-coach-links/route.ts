/**
 * SAM-68 — E2E only (never in production, like `/api/e2e/login`): ends the
 * athlete's ACTIVE coach links in one school so a spec can reproduce "aluno
 * da escola sem professor responsável" (the queue) deterministically.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/server/db";

const bodySchema = z.object({ athleteEmail: z.string().email(), schoolId: z.string().min(1).max(256) });

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const athlete = await prisma.user.findUnique({ where: { email: parsed.data.athleteEmail }, select: { id: true } });
  if (!athlete) return NextResponse.json({ error: "athlete not found" }, { status: 404 });
  const now = new Date();
  const { count } = await prisma.coachAthleteAssignment.updateMany({
    where: { athleteId: athlete.id, schoolId: parsed.data.schoolId, status: "ACTIVE", endedAt: null },
    data: { status: "ENDED", endedAt: now, updatedAt: now },
  });
  return NextResponse.json({ athleteId: athlete.id, ended: count });
}