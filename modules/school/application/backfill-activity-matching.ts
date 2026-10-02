/**
 * SAM-33 — one-time backfill: imported activities that predate automatic
 * matching never met a prescription. Pages through activities without any
 * execution, newest first, and runs the same hook the syncs run. Bounded per
 * call (`limit`) and resumable (`cursor`), so it can be run in slices against
 * the production database without a long transaction.
 */
import type { PrismaClient } from "@prisma/client";
import type { ExecutionDetailLoader } from "./calculate-workout-compliance";
import { matchPersistedActivity } from "./match-persisted-activity";

export type BackfillActivityMatchingInput = {
  /** Only activities started on/after this instant (default: last 90 days). */
  since?: Date;
  /** Max activities per call (1–500, default 100). */
  limit?: number;
  /** Activity id to resume after (the previous call's `nextCursor`). */
  cursor?: string;
  /** Restrict to one athlete (user id). */
  athleteId?: string;
};

export type BackfillActivityMatchingResult = {
  processed: number;
  autoMatched: number;
  pending: number;
  unplanned: number;
  skipped: number;
  nextCursor: string | null;
};

const DEFAULT_LOOKBACK_DAYS = 90;

export class BackfillActivityMatching {
  constructor(
    private readonly db: PrismaClient,
    private readonly loadDetail: ExecutionDetailLoader | null = null,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: BackfillActivityMatchingInput = {}): Promise<BackfillActivityMatchingResult> {
    const limit = Math.min(500, Math.max(1, input.limit ?? 100));
    const since = input.since ?? new Date(this.clock().getTime() - DEFAULT_LOOKBACK_DAYS * 86_400_000);

    const rows = await this.db.activity.findMany({
      where: {
        startedAt: { gte: since },
        workoutExecutions: { none: {} },
        ...(input.athleteId ? { userId: input.athleteId } : {}),
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const page = rows.slice(0, limit);
    const result: BackfillActivityMatchingResult = {
      processed: 0, autoMatched: 0, pending: 0, unplanned: 0, skipped: 0,
      nextCursor: rows.length > limit ? page[page.length - 1]?.id ?? null : null,
    };

    for (const activity of page) {
      const outcome = await matchPersistedActivity(this.db, activity, { clock: this.clock, loadDetail: this.loadDetail });
      result.processed += 1;
      if (outcome.skipped) {
        if (outcome.reason === "NO_CANDIDATES") result.unplanned += 1;
        else result.skipped += 1;
      } else if (outcome.matchStatus === "AUTO_MATCHED") {
        result.autoMatched += 1;
      } else {
        result.pending += 1;
      }
    }

    return result;
  }
}
