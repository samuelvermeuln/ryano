import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { MatchActivityToWorkout } from "@/modules/school/application/match-activity-to-workout";
import { ConfirmWorkoutMatch } from "@/modules/school/application/manage-workout-match";
import { prisma } from "@/server/db";

/**
 * SAM-17 — E2E only (never in production, like `/api/e2e/login`).
 *
 * Simulates what a provider sync would leave behind for one prescription: an
 * imported Garmin `Activity` with persisted splits and time-in-zone totals,
 * then runs the REAL match + confirm use cases, so the test exercises the
 * production path (`activityId` resolution, `matchedActivityId` on the
 * assignment) and not a hand-written row. No provider API key is involved: the
 * detail reads the persisted splits (the SAM-17 no-key path).
 */
const bodySchema = z.object({
  athleteEmail: z.string().email(),
  assignmentId: z.string().min(1),
  /** Laps as the watch would record them, in order. */
  laps: z.array(z.object({
    durationSeconds: z.number().int().positive(),
    distanceMeters: z.number().positive(),
    averageHeartRate: z.number().int().positive(),
  })).min(1).max(40),
});

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const { athleteEmail, assignmentId, laps } = parsed.data;

  const athlete = await prisma.user.findUnique({ where: { email: athleteEmail.toLowerCase() }, select: { id: true } });
  if (!athlete) return NextResponse.json({ error: "athlete not found" }, { status: 404 });
  const assignment = await prisma.workoutAssignment.findUnique({
    where: { id: assignmentId },
    select: { athleteId: true, scheduledAt: true, workout: { select: { sportType: true } } },
  });
  if (!assignment || assignment.athleteId !== athlete.id || !assignment.workout) {
    return NextResponse.json({ error: "assignment not found for athlete" }, { status: 404 });
  }

  const connection = await prisma.wearableConnection.upsert({
    where: { userId_provider: { userId: athlete.id, provider: "GARMIN" } },
    update: {},
    create: { userId: athlete.id, provider: "GARMIN", status: "CONNECTED", capabilities: [], label: "E2E Garmin" },
    select: { id: true },
  });

  const durationSeconds = laps.reduce((sum, lap) => sum + lap.durationSeconds, 0);
  const distanceMeters = laps.reduce((sum, lap) => sum + lap.distanceMeters, 0);
  const averageHeartRate = Math.round(laps.reduce((sum, lap) => sum + lap.averageHeartRate * lap.durationSeconds, 0) / durationSeconds);
  const startedAt = assignment.scheduledAt ?? new Date();
  const externalId = `e2e-${assignmentId}`;

  // Garmin-shaped persisted detail: splits rows + hrTimeInZone_* totals, i.e.
  // exactly what `cacheGarminActivitySplits` and the summary sync would store.
  const splits = laps.map((lap, index) => ({
    lapIndex: index + 1,
    duration: lap.durationSeconds,
    distance: lap.distanceMeters,
    averageHR: lap.averageHeartRate,
    maxHR: lap.averageHeartRate + 8,
    averageSpeed: lap.distanceMeters / lap.durationSeconds,
  }));
  const zoneSeconds = [0, 0, 0, 0, 0];
  for (const lap of laps) {
    const zone = lap.averageHeartRate < 120 ? 0 : lap.averageHeartRate < 140 ? 1 : lap.averageHeartRate < 160 ? 2 : lap.averageHeartRate < 175 ? 3 : 4;
    zoneSeconds[zone] += lap.durationSeconds;
  }
  const metrics = {
    hrTimeInZone_1: zoneSeconds[0], hrTimeInZone_2: zoneSeconds[1], hrTimeInZone_3: zoneSeconds[2],
    hrTimeInZone_4: zoneSeconds[3], hrTimeInZone_5: zoneSeconds[4],
    garminActivityDetails: { typedSplits: [], splits, splitSummaries: [] },
  };

  const activity = await prisma.activity.upsert({
    where: { provider_externalId_userId: { provider: "GARMIN", externalId, userId: athlete.id } },
    update: { metrics, durationSeconds, distanceMeters, averageHeartRate, startedAt },
    create: {
      userId: athlete.id, wearableConnectionId: connection.id, externalId, provider: "GARMIN",
      sportType: assignment.workout.sportType, providerSportType: assignment.workout.sportType, name: "E2E Garmin activity",
      startedAt, durationSeconds, distanceMeters, averageHeartRate, maxHeartRate: averageHeartRate + 12,
      averageSpeed: distanceMeters / durationSeconds, metrics,
    },
    select: { id: true },
  });

  const execution = await new MatchActivityToWorkout(prisma).execute({
    workoutAssignmentId: assignmentId,
    athleteId: athlete.id,
    source: "GARMIN",
    externalId,
    sportType: assignment.workout.sportType,
    startedAt,
    durationSeconds,
    distanceMeters,
    averageHeartRate,
    maxHeartRate: averageHeartRate + 12,
    averageSpeed: distanceMeters / durationSeconds,
    activityPayload: { source: "e2e-fixture" },
  });
  const confirmed = await new ConfirmWorkoutMatch(prisma).execute(athlete.id, { executionId: execution.id });

  return NextResponse.json({
    ok: true,
    activityId: activity.id,
    executionId: confirmed.id,
    executionActivityId: confirmed.activityId,
    matchStatus: confirmed.matchStatus,
  });
}
