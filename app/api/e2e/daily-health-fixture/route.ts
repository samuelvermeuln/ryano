import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/server/db";

/**
 * SAM-43 — E2E only (never in production, like `/api/e2e/login`). Writes the
 * persisted daily health a sync would have left for one athlete: a Garmin
 * connection and N days of `AthleteDailyHealth` ending today (local day in
 * America/Sao_Paulo), with a Body Battery-labelled energy score.
 */
const bodySchema = z.object({
  athleteEmail: z.string().email(),
  days: z.number().int().min(1).max(28).default(7),
  /** Today's values; earlier days vary slightly around them. */
  restingHeartRate: z.number().int().positive().default(48),
  sleepScore: z.number().int().min(0).max(100).default(82),
  hrvLastNight: z.number().positive().default(56),
  energyHighest: z.number().int().min(0).max(100).default(90),
});

function localDate(now: Date, offsetDays: number): string {
  const shifted = new Date(now.getTime() - offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(shifted);
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const input = parsed.data;

  const athlete = await prisma.user.findUnique({ where: { email: input.athleteEmail.toLowerCase() }, select: { id: true } });
  if (!athlete) return NextResponse.json({ error: "athlete not found" }, { status: 404 });

  await prisma.wearableConnection.upsert({
    where: { userId_provider: { userId: athlete.id, provider: "GARMIN" } },
    update: {},
    create: { userId: athlete.id, provider: "GARMIN", status: "CONNECTED", capabilities: [], label: "E2E Garmin" },
  });

  const now = new Date();
  const dates: string[] = [];
  for (let offset = input.days - 1; offset >= 0; offset -= 1) {
    const date = localDate(now, offset);
    dates.push(date);
    const wobble = offset % 3; // small, deterministic variation
    await prisma.athleteDailyHealth.upsert({
      where: { userId_provider_date: { userId: athlete.id, provider: "GARMIN", date } },
      update: {},
      create: {
        userId: athlete.id, provider: "GARMIN", date, timeZone: "America/Sao_Paulo", fetchedAt: now,
        restingHeartRate: input.restingHeartRate + wobble,
        sleepScore: Math.max(0, input.sleepScore - wobble * 4),
        sleepDurationSeconds: 7 * 3600 - wobble * 600,
        hrvLastNight: input.hrvLastNight - wobble,
        hrvStatus: "BALANCED",
        energyHighest: Math.max(0, input.energyHighest - wobble * 5),
        energyLowest: 25 + wobble,
        energyLabel: "Body Battery",
        readinessScore: 70, readinessLevel: "HIGH", steps: 8000 + wobble * 500,
      },
    });
  }

  return NextResponse.json({ ok: true, athleteId: athlete.id, dates });
}
