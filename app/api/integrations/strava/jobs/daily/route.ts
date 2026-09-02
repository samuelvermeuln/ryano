import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { runStravaDailyMaintenanceJob } from "@/modules/strava/application/jobs/run-strava-jobs";
import { prisma } from "@/server/db";
import { isAuthorizedStravaJobRequest } from "../authorization";

/**
 * Daily Strava maintenance job: incremental full-account sync and local TTL
 * cleanup. It intentionally does not drain webhook events, which belong to the
 * frequent `/api/integrations/strava/jobs` worker.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return runStravaDailyMaintenanceJobs(request);
}

export async function GET(request: Request) {
  return runStravaDailyMaintenanceJobs(request);
}

async function runStravaDailyMaintenanceJobs(request: Request) {
  if (!isAuthorizedStravaJobRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await runStravaDailyMaintenanceJob();

  await prisma.integrationEvent
    .create({
      data: {
        provider: "STRAVA",
        eventType: "strava.daily-maintenance.run",
        externalId: new Date().toISOString(),
        payload: result as unknown as Prisma.InputJsonObject,
      },
    })
    .catch(() => undefined);

  return NextResponse.json({ ...result, timestamp: new Date().toISOString() });
}
