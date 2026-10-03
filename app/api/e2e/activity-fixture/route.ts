import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { MatchActivityToWorkout } from "@/modules/school/application/match-activity-to-workout";
import { matchPersistedActivity } from "@/modules/school/application/match-persisted-activity";
import { ConfirmWorkoutMatch } from "@/modules/school/application/manage-workout-match";
import { normalizedActivityDetailSchema, type NormalizedActivityDetail } from "@/modules/shared/activities/contracts";
import { persistActivityDetail } from "@/modules/shared/activities/detail-ingestion";
import { markDuplicateSession } from "@/modules/shared/activities/duplicate-sessions";
import { linkProviderChildCopies } from "@/modules/shared/activities/application/multisport";
import { loadExecutionLaps } from "@/modules/strava/application/activities/activity-visual-with-split-fallback";
import { prisma } from "@/server/db";

/** One sample every 10 s: time, distance, HR around the lap's average, and a GPS trace heading north-east. */
function buildRichFixture(
  laps: Array<{ durationSeconds: number; distanceMeters: number; averageHeartRate: number }>,
  zoneSeconds: number[],
  startedAt: Date,
  gap: { fromSecond: number; toSecond: number } | null = null,
): NormalizedActivityDetail {
  const source = { provider: "GARMIN" as const, kind: "native" as const };
  const time: number[] = [];
  // SAM-72 — a measurement gap is null (never zero), like a sensor dropout.
  const distance: Array<number | null> = [];
  const heartRate: Array<number | null> = [];
  const latlng: [number, number][] = [];
  let elapsed = 0;
  let covered = 0;
  for (const lap of laps) {
    const steps = Math.max(1, Math.floor(lap.durationSeconds / 10));
    for (let step = 0; step < steps; step += 1) {
      time.push(elapsed);
      const missing = gap !== null && elapsed >= gap.fromSecond && elapsed < gap.toSecond;
      distance.push(missing ? null : covered);
      heartRate.push(missing ? null : lap.averageHeartRate + Math.round(Math.sin(step) * 5));
      latlng.push([-23.55 + covered / 111_000, -46.63 + covered / 111_000]);
      elapsed += 10;
      covered += lap.distanceMeters / steps;
    }
  }
  return normalizedActivityDetailSchema.parse({
    provider: "GARMIN",
    externalId: "fixture",
    laps: laps.map((lap, index) => ({
      lapNumber: index + 1,
      startedAt: new Date(startedAt.getTime() + laps.slice(0, index).reduce((sum, previous) => sum + previous.durationSeconds, 0) * 1000),
      durationSeconds: lap.durationSeconds,
      distanceMeters: lap.distanceMeters,
      averageSpeed: lap.distanceMeters / lap.durationSeconds,
      averageHeartRate: lap.averageHeartRate,
      maxHeartRate: lap.averageHeartRate + 8,
    })),
    zones: [{
      zoneType: "HEART_RATE", source, configurationRef: null,
      zones: zoneSeconds.map((seconds, index) => ({ zoneNumber: index + 1, label: null, lowerBound: null, upperBound: null, durationSeconds: seconds })),
    }],
    streams: [
      { key: "time", values: time, source },
      { key: "distance", values: distance, source },
      { key: "heartRate", values: heartRate, source },
      { key: "latlng", values: latlng, source },
    ],
    stats: { trainingLoad: 42.5, aerobicEffect: 2.8, aerobicEffectLabel: "Base aeróbica", energyImpact: -15, energyLabel: "Body Battery" },
    sources: { laps: source, zones: source, streams: source, stats: source },
  });
}

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
  /** Without it (SAM-20) the activity is only imported — no prescription, no execution. */
  assignmentId: z.string().min(1).optional(),
  /** ISO instant and canonical sport for an unprescribed import; ignored when `assignmentId` is given. */
  startedAt: z.string().datetime().optional(),
  sportType: z.string().min(1).max(100).optional(),
  externalId: z.string().min(1).max(100).optional(),
  /** SAM-33 — run the post-persistence matching hook, exactly as a sync would (ignored with `assignmentId`). */
  autoMatch: z.boolean().optional(),
  /** Laps as the watch would record them, in order. */
  laps: z.array(z.object({
    durationSeconds: z.number().int().positive(),
    distanceMeters: z.number().positive(),
    averageHeartRate: z.number().int().positive(),
  })).min(1).max(40),
  /**
   * SAM-40 — also ingest the rich detail (ActivityLap/ActivityZone/ActivityStream
   * + extended stats) through the real core step, with a synthetic GPS trace
   * and HR series derived from the laps, as a sync would have left it.
   */
  rich: z.boolean().optional(),
  /**
   * SAM-75 — multisport: the provider's legs (typed splits) persisted with the
   * activity, and `parentExternalId` to import a per-sport copy as a child of
   * a parent already imported (what Garmin's `parentSummaryId` would say).
   */
  legs: z.array(z.object({ sportType: z.string(), elapsedDuration: z.number().positive(), distance: z.number().nonnegative().optional() })).max(10).optional(),
  parentExternalId: z.string().min(1).max(100).optional(),
  /** SAM-72 — with `rich`: seconds (from the start) where the samples are missing. */
  gap: z.object({ fromSecond: z.number().int().min(0), toSecond: z.number().int().positive() }).optional(),
  /**
   * SAM-48 — which connection "synced" the import (unprescribed path only).
   * A second call with the other provider at the same instant reproduces the
   * same session mirrored by two connections; the real `markDuplicateSession`
   * runs, as in every sync.
   */
  provider: z.enum(["GARMIN", "STRAVA"]).optional(),
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
  const assignment = assignmentId
    ? await prisma.workoutAssignment.findUnique({
      where: { id: assignmentId },
      select: { athleteId: true, scheduledAt: true, workout: { select: { sportType: true } } },
    })
    : null;
  if (assignmentId && (!assignment || assignment.athleteId !== athlete.id || !assignment.workout)) {
    return NextResponse.json({ error: "assignment not found for athlete" }, { status: 404 });
  }
  const sportType = assignment?.workout?.sportType ?? parsed.data.sportType ?? "run";
  const provider = assignmentId ? "GARMIN" : (parsed.data.provider ?? "GARMIN");

  const connection = await prisma.wearableConnection.upsert({
    where: { userId_provider: { userId: athlete.id, provider } },
    // A connection that just synced an activity is connected (SAM-49 spec 48
    // needs it); without an explicit provider the old behaviour is kept.
    update: parsed.data.provider ? { status: "CONNECTED" } : {},
    create: { userId: athlete.id, provider, status: "CONNECTED", capabilities: [], label: `E2E ${provider}` },
    select: { id: true },
  });

  const durationSeconds = laps.reduce((sum, lap) => sum + lap.durationSeconds, 0);
  const distanceMeters = laps.reduce((sum, lap) => sum + lap.distanceMeters, 0);
  const averageHeartRate = Math.round(laps.reduce((sum, lap) => sum + lap.averageHeartRate * lap.durationSeconds, 0) / durationSeconds);
  const startedAt = assignment?.scheduledAt ?? (parsed.data.startedAt ? new Date(parsed.data.startedAt) : new Date());
  const externalId = assignmentId ? `e2e-${assignmentId}` : `e2e-free-${parsed.data.externalId ?? startedAt.getTime()}`;

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
    garminActivityDetails: { typedSplits: parsed.data.legs ?? [], splits, splitSummaries: [] },
    ...(parsed.data.parentExternalId ? { parentSummaryId: parsed.data.parentExternalId } : {}),
  };

  const activity = await prisma.activity.upsert({
    where: { provider_externalId_userId: { provider, externalId, userId: athlete.id } },
    update: { metrics, durationSeconds, distanceMeters, averageHeartRate, startedAt },
    create: {
      userId: athlete.id, wearableConnectionId: connection.id, externalId, provider,
      sportType, providerSportType: sportType, name: `E2E ${provider} activity`,
      startedAt, durationSeconds, distanceMeters, averageHeartRate, maxHeartRate: averageHeartRate + 12,
      averageSpeed: distanceMeters / durationSeconds, metrics,
    },
  });

  // SAM-75 — a per-sport copy points at its parent, as the provider relation would make it.
  if (parsed.data.parentExternalId) await linkProviderChildCopies(prisma, { ...activity, rawPayload: null, metrics });

  if (parsed.data.rich) {
    await persistActivityDetail(prisma, activity.id, buildRichFixture(laps, zoneSeconds, startedAt, parsed.data.gap ?? null));
  }

  if (!assignmentId) {
    // Same post-persistence order as the syncs: mirror detection, then matching.
    const duplicate = await markDuplicateSession(prisma, activity);
    const current = duplicate.status === "marked" && duplicate.duplicateId === activity.id
      ? { ...activity, duplicateOfActivityId: duplicate.keepId }
      : activity;
    const matching = parsed.data.autoMatch
      ? await matchPersistedActivity(prisma, current, { loadDetail: loadExecutionLaps })
      : null;
    return NextResponse.json({
      ok: true, activityId: activity.id, executionId: null, matchStatus: matching?.matchStatus ?? null,
      matching, startedAt: startedAt.toISOString(),
      duplicateOfActivityId: current.duplicateOfActivityId ?? null,
    });
  }

  const execution = await new MatchActivityToWorkout(prisma, undefined, loadExecutionLaps).execute({
    workoutAssignmentId: assignmentId,
    athleteId: athlete.id,
    source: "GARMIN",
    externalId,
    sportType,
    startedAt,
    durationSeconds,
    distanceMeters,
    averageHeartRate,
    maxHeartRate: averageHeartRate + 12,
    averageSpeed: distanceMeters / durationSeconds,
    activityPayload: { source: "e2e-fixture" },
  });
  const confirmed = await new ConfirmWorkoutMatch(prisma, undefined, loadExecutionLaps).execute(athlete.id, { executionId: execution.id });

  return NextResponse.json({
    ok: true,
    activityId: activity.id,
    executionId: confirmed.id,
    executionActivityId: confirmed.activityId,
    matchStatus: confirmed.matchStatus,
  });
}
