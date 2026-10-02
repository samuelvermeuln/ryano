/**
 * SAM-39 — backfill the rich detail (laps, zones, streams, extended stats)
 * of activities imported before the ingestion existed.
 *
 *   npx tsx scripts/backfill-activity-detail.ts                     # last 365 days, 50 per page, all pages
 *   npx tsx scripts/backfill-activity-detail.ts --provider=STRAVA   # one provider
 *   npx tsx scripts/backfill-activity-detail.ts --athlete=<userId>  # one athlete
 *   npx tsx scripts/backfill-activity-detail.ts --days=90 --limit=20 --pages=3
 *   npx tsx scripts/backfill-activity-detail.ts --force             # re-ingest everything
 *
 * Idempotent: an activity already ingested (`detailSyncedAt`) is skipped
 * unless `--force`; re-ingesting replaces only the rows of the same provider.
 * Strava: two calls per activity (laps when not cached + streams); a 429 stops
 * the run and prints the cursor to resume from (official rate limits:
 * https://developers.strava.com/docs/rate-limits/). Garmin: no call — the
 * detail is built from the stored summary and split cache.
 */
import type { Activity } from "@prisma/client";
import { prisma } from "../server/db";
import { BackfillActivityDetail } from "../modules/shared/activities/detail-ingestion/backfill-activity-detail";
import { buildGarminActivityDetail } from "../modules/garmin/application/activities/garmin-activity-detail-provider";
import { createStravaClient, StravaRateLimitError, StravaRateLimitExceededError } from "../modules/strava/api/client";
import { fetchStravaActivityDetail } from "../modules/strava/application/activities/strava-activity-detail-provider";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const days = Number(arg("days") ?? 365);
  const limit = Number(arg("limit") ?? 50);
  const maxPages = Number(arg("pages") ?? Number.POSITIVE_INFINITY);
  const provider = arg("provider") as "GARMIN" | "STRAVA" | undefined;
  const athleteId = arg("athlete");
  const force = process.argv.includes("--force");
  const since = new Date(Date.now() - days * 86_400_000);

  const stravaClient = createStravaClient();
  const backfill = new BackfillActivityDetail(prisma, {
    GARMIN: async (activity: Activity) => buildGarminActivityDetail(activity),
    STRAVA: (activity: Activity) =>
      fetchStravaActivityDetail(stravaClient, { connectionId: activity.wearableConnectionId, userId: activity.userId }, activity),
  }, {
    isRateLimitError: (error) => error instanceof StravaRateLimitError || error instanceof StravaRateLimitExceededError,
  });

  const totals = { processed: 0, ingested: 0, skipped: 0, failed: 0 };
  let cursor: string | undefined = arg("cursor");
  let pages = 0;
  do {
    const result = await backfill.execute({ since, limit, cursor, provider, athleteId, force });
    pages += 1;
    totals.processed += result.processed; totals.ingested += result.ingested; totals.skipped += result.skipped; totals.failed += result.failed;
    console.log(`page ${pages}: ${result.processed} processed, ${result.ingested} ingested, ${result.skipped} skipped, ${result.failed} failed${result.rateLimited ? " — RATE LIMITED" : ""}`);
    if (result.rateLimited) {
      console.log(`stopped on a rate limit; resume later with --cursor=${result.nextCursor ?? "(start)"}`);
      break;
    }
    cursor = result.nextCursor ?? undefined;
  } while (cursor && pages < maxPages);
  console.log(`done: ${totals.processed} processed, ${totals.ingested} ingested, ${totals.skipped} skipped, ${totals.failed} failed`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
