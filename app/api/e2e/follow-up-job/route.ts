/**
 * SAM-56 — E2E only (never in production, like `/api/e2e/login`): runs the
 * reminders job with a given clock for ONE participation and returns its
 * reminders, so a spec can "advance time" to D−7 without waiting days and
 * without firing anyone else's reminders.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/server/db";
import { RunFollowUpReminders } from "@/modules/school/application/follow-up-reminders";

const bodySchema = z.object({
  now: z.iso.datetime({ offset: true }),
  participationId: z.string().min(1).max(256),
});

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const now = new Date(parsed.data.now);
  const summary = await new RunFollowUpReminders(prisma, () => now).execute({ limit: 50, sourceIds: [parsed.data.participationId] });
  const reminders = await prisma.scheduledReminder.findMany({
    where: { sourceId: parsed.data.participationId },
    select: { kind: true, audience: true, status: true, dueAt: true, dedupeKey: true },
    orderBy: { dueAt: "asc" },
  });
  return NextResponse.json({ summary, reminders });
}
