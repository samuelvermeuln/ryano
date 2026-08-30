import { NextResponse } from "next/server";

import { prisma } from "@/server/db";
import { env } from "@/server/env";
import {
  enqueueDueDailyGarminSummaries,
  getGarminJobRunSchedule,
  getGarminJobsRunEventType,
  syncAllGarminUsers,
} from "@/modules/garmin";
import { dispatchPendingWhatsAppDeliveries } from "@/server/services/reporting";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return runGarminJobs(request);
}

export async function GET(request: Request) {
  return runGarminJobs(request);
}

async function runGarminJobs(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const schedule = await getGarminJobRunSchedule();

  if (!force && !schedule.due) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "JOB_INTERVAL_NOT_REACHED",
      settings: schedule.settings,
      lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
      nextAllowedAt: schedule.nextAllowedAt?.toISOString() ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  const syncSummary = await syncAllGarminUsers();
  const dailyQueueSummary = await enqueueDueDailyGarminSummaries();
  const dispatchSummary = await dispatchPendingWhatsAppDeliveries();

  await prisma.integrationEvent.create({
    data: {
      provider: "GARMIN",
      eventType: getGarminJobsRunEventType(),
      payload: {
        settings: schedule.settings,
        syncSummary,
        dailyQueueSummary,
        dispatchSummary,
        trigger: force ? "api-force" : "api",
      },
    },
  }).catch(() => undefined);

  const updatedSchedule = await getGarminJobRunSchedule();

  return NextResponse.json({
    ok: true,
    skipped: false,
    settings: updatedSchedule.settings,
    lastRunAt: updatedSchedule.lastRunAt?.toISOString() ?? null,
    nextAllowedAt: updatedSchedule.nextAllowedAt?.toISOString() ?? null,
    ...syncSummary,
    dailyQueueSummary,
    dispatchSummary,
    timestamp: new Date().toISOString(),
  });
}

function isAuthorized(request: Request) {
  const expectedKey = env.GARMIN_ADMIN_KEY;

  if (!expectedKey) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  const adminKey = request.headers.get("x-admin-key")?.trim();

  return bearer === expectedKey || adminKey === expectedKey;
}
