/**
 * SAM-39 — backfill: ingest the rich detail of activities imported before the
 * ingestion existed (`detailSyncedAt IS NULL`). Paged, resumable, bounded per
 * call, and it stops on the first rate limit so quota is never burnt in a
 * loop. The loaders are injected per provider by the script (the core never
 * imports a provider module).
 */
import type { Activity, PrismaClient } from "@prisma/client";
import type { ProviderId } from "@/modules/shared/integrations/types";
import type { NormalizedActivityDetail } from "../contracts/rich";
import { ingestActivityDetail } from "./ingest-activity-detail";

export type ProviderDetailLoader = (activity: Activity) => Promise<NormalizedActivityDetail | null>;

export type BackfillActivityDetailInput = {
  /** Only activities started on/after this instant (default: last 365 days). */
  since?: Date;
  /** Max activities per call (1–200, default 50). */
  limit?: number;
  cursor?: string;
  /** Restrict to one provider / one athlete. */
  provider?: ProviderId;
  athleteId?: string;
  /** Re-ingest activities already synced. */
  force?: boolean;
};

export type BackfillActivityDetailResult = {
  processed: number;
  ingested: number;
  skipped: number;
  failed: number;
  /** True when the page stopped on a rate limit; resume later from `nextCursor`. */
  rateLimited: boolean;
  nextCursor: string | null;
};

const DEFAULT_LOOKBACK_DAYS = 365;

export class BackfillActivityDetail {
  constructor(
    private readonly db: PrismaClient,
    private readonly loaders: Partial<Record<ProviderId, ProviderDetailLoader>>,
    private readonly options: { clock?: () => Date; isRateLimitError?: (error: unknown) => boolean } = {},
  ) {}

  async execute(input: BackfillActivityDetailInput = {}): Promise<BackfillActivityDetailResult> {
    const now = this.options.clock ?? (() => new Date());
    const limit = Math.min(200, Math.max(1, input.limit ?? 50));
    const since = input.since ?? new Date(now().getTime() - DEFAULT_LOOKBACK_DAYS * 86_400_000);
    const providers = (input.provider ? [input.provider] : Object.keys(this.loaders)) as ProviderId[];

    const rows = await this.db.activity.findMany({
      where: {
        startedAt: { gte: since },
        provider: { in: providers as never[] },
        ...(input.force ? {} : { detailSyncedAt: null }),
        ...(input.athleteId ? { userId: input.athleteId } : {}),
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const page = rows.slice(0, limit);
    const result: BackfillActivityDetailResult = {
      processed: 0, ingested: 0, skipped: 0, failed: 0, rateLimited: false,
      nextCursor: rows.length > limit ? page[page.length - 1]?.id ?? null : null,
    };

    for (const activity of page) {
      const loader = this.loaders[activity.provider as ProviderId];
      if (!loader) { result.skipped += 1; continue; }
      const outcome = await ingestActivityDetail(this.db, activity, () => loader(activity), {
        force: input.force, now, isRateLimitError: this.options.isRateLimitError,
      });
      result.processed += 1;
      if (outcome.status === "ingested") result.ingested += 1;
      else if (outcome.status === "skipped") result.skipped += 1;
      else {
        result.failed += 1;
        if (outcome.rateLimited) {
          // Resume from this activity next time: it was not ingested.
          result.rateLimited = true;
          result.nextCursor = page[page.indexOf(activity) - 1]?.id ?? input.cursor ?? null;
          break;
        }
      }
    }
    return result;
  }
}
