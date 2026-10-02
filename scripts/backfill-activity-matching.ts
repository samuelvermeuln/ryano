/**
 * SAM-33 — backfill: run automatic matching over imported activities that
 * never met a prescription (they predate the post-persistence hook).
 *
 *   npx tsx scripts/backfill-activity-matching.ts                 # last 90 days, 100 per page, all pages
 *   npx tsx scripts/backfill-activity-matching.ts --days=365      # lookback
 *   npx tsx scripts/backfill-activity-matching.ts --limit=50      # page size (max 500)
 *   npx tsx scripts/backfill-activity-matching.ts --athlete=<id>  # one athlete
 *   npx tsx scripts/backfill-activity-matching.ts --pages=1       # stop after N pages
 *
 * Idempotent: an activity that already has an execution is skipped by the
 * hook, so re-running never duplicates. Uses the live use cases (score,
 * compliance with the lap reader), so a backfilled match is the match the
 * sync would have produced.
 */
import { prisma } from "../server/db";
import { BackfillActivityMatching } from "../modules/school/application/backfill-activity-matching";
import { loadExecutionLaps } from "../modules/strava/application/activities/activity-visual-with-split-fallback";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const days = Number(arg("days") ?? 90);
  const limit = Number(arg("limit") ?? 100);
  const maxPages = Number(arg("pages") ?? Number.POSITIVE_INFINITY);
  const athleteId = arg("athlete");
  const since = new Date(Date.now() - days * 86_400_000);

  const backfill = new BackfillActivityMatching(prisma, loadExecutionLaps);
  const totals = { processed: 0, autoMatched: 0, pending: 0, unplanned: 0, skipped: 0 };
  let cursor: string | undefined;
  let pages = 0;

  do {
    const result = await backfill.execute({ since, limit, cursor, athleteId });
    pages += 1;
    totals.processed += result.processed;
    totals.autoMatched += result.autoMatched;
    totals.pending += result.pending;
    totals.unplanned += result.unplanned;
    totals.skipped += result.skipped;
    console.log(`page ${pages}: ${result.processed} processed, ${result.autoMatched} auto-matched, ${result.pending} pending, ${result.unplanned} unplanned, ${result.skipped} skipped`);
    cursor = result.nextCursor ?? undefined;
  } while (cursor && pages < maxPages);

  console.log(`done: ${totals.processed} processed, ${totals.autoMatched} auto-matched, ${totals.pending} pending, ${totals.unplanned} unplanned, ${totals.skipped} skipped`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
