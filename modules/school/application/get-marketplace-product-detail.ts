import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TrainingProductStatus, TrainingProductVisibility } from "../domain/enums";
import { parsePlanPayload } from "../domain/training-product-version";
import { SchoolError } from "../domain/errors";

/**
 * TM032 — `GET /api/marketplace/products/[idDoTreino]` (public detail, RF-106).
 *
 * No actor/session concept, same boundary as `ListMarketplaceProducts`
 * (TM031): the authenticated "see my own DRAFT/SCHOOL_ONLY product" path is
 * the separate studio route (`GET /api/coach/products/[id]`, a different
 * track), never a branch inside this one. Every caller here is treated as an
 * anonymous visitor — DRAFT/ARCHIVED/SCHOOL_ONLY always 404, and the 404 for
 * "hidden" uses the exact same code/message as "does not exist" so a probe
 * cannot distinguish the two (RNF-001 — "não vazar existência").
 *
 * `UNLISTED` is allowed here (and only here — never in TM031's listing)
 * because this endpoint is, by construction, always a direct id/slug lookup.
 */

export const getMarketplaceProductDetailSchema = z.strictObject({
  idOrSlug: z.string().trim().min(1).max(256),
});
export type GetMarketplaceProductDetailInput = z.infer<typeof getMarketplaceProductDetailSchema>;

export interface MarketplaceProductDetailMedia {
  id: string;
  kind: string;
  storageKey: string;
  thumbnailKey: string | null;
  altText: string;
  caption: string | null;
  access: string;
}

export interface MarketplacePreviewWorkout {
  id: string;
  title: string;
  description: string | null;
  sportType: string;
}

export interface MarketplacePreviewSession {
  dayOfWeek: number;
  /** Stable id only for schemaVersion 2 plans (TM010); null for the legacy single-session-per-day format. */
  planSessionId: string | null;
  sportType: string | null;
  order: number;
  note: string | null;
  alternative: string | null;
  workoutTemplate: MarketplacePreviewWorkout | null;
}

export interface MarketplacePreviewDay {
  dayOfWeek: number;
  sessions: MarketplacePreviewSession[];
}

export interface MarketplacePreviewWeek {
  week: number;
  days: MarketplacePreviewDay[];
}

export interface MarketplaceProductAuthor {
  kind: "coach" | "school";
  id: string;
  name: string;
  bio: string | null;
}

export interface MarketplaceProductDetail {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  objective: string | null;
  difficulty: string | null;
  goalType: string | null;
  targetEventType: string | null;
  targetDistance: string | null;
  sportTypes: string[];
  durationWeeks: number | null;
  sessionsPerWeek: number | null;
  sessionDurationMinMax: { min: number | null; max: number | null } | null;
  equipment: string | null;
  language: string | null;
  availability: string | null;
  publicMedia: MarketplaceProductDetailMedia[];
  /**
   * One deliberately-public sample week, NEVER the full plan (spec §5.2).
   * Source is `previewVersionId` when the author curated a dedicated
   * preview; otherwise it falls back to the FIRST week of the current
   * published version — a hard cap that guarantees this DTO can never leak
   * the whole plan even when no dedicated preview exists.
   */
  previewWeeks: MarketplacePreviewWeek[];
  author: MarketplaceProductAuthor | null;
  /**
   * TM032 — identical to `author` today. `TrainingProduct` has no
   * `authorCoachId` distinct from its `schoolId`/`coachId` ownership, so a
   * professor-employed-by-a-school cannot yet be named separately from the
   * school as commercial owner. Q3/TM019 (task-list.md) is the task that
   * resolves this; `seller` is wired into the DTO shape now so consumers do
   * not need a breaking change once it lands.
   */
  seller: MarketplaceProductAuthor | null;
  /** null = no APPROVED reviews yet ("Novo"), never a literal 0 (RF-112/RNF-012). */
  ratingAverage: number | null;
  reviewCount: number;
  price: { amountCents: number; currency: string } | null;
  offerTerms: { policyVersion: string | null };
  /** See `ListMarketplaceProducts` — always false; no product-level field exists yet to derive this honestly. */
  coachingIncluded: boolean;
  versionId: string;
}

type ProductRow = {
  id: string;
  schoolId: string | null;
  coachId: string | null;
  slug: string | null;
  title: string;
  description: string | null;
  objective: string | null;
  difficulty: string | null;
  goalType: string | null;
  targetEventType: string | null;
  targetDistance: string | null;
  sportType: string | null;
  durationWeeks: number | null;
  sessionsPerWeek: number | null;
  sessionDurationMin: number | null;
  sessionDurationMax: number | null;
  equipment: string | null;
  language: string | null;
  availability: string | null;
  sellerPolicyVersion: string | null;
  priceCents: number | null;
  currency: string | null;
  currentVersionId: string | null;
  previewVersionId: string | null;
  status: string;
  visibility: string;
};

const PRODUCT_SELECT = {
  id: true, schoolId: true, coachId: true, slug: true, title: true, description: true,
  objective: true, difficulty: true, goalType: true, targetEventType: true, targetDistance: true,
  sportType: true, durationWeeks: true, sessionsPerWeek: true, sessionDurationMin: true,
  sessionDurationMax: true, equipment: true, language: true, availability: true,
  sellerPolicyVersion: true, priceCents: true, currency: true, currentVersionId: true,
  previewVersionId: true, status: true, visibility: true,
} as const;

/**
 * `UNLISTED` belongs here because this endpoint is by construction a direct
 * id/slug lookup (it is excluded from the listing instead). `SCHOOL_ONLY` and
 * `PRIVATE` never do: both depend on who is asking, and this use case has no
 * actor.
 */
const PUBLICLY_VIEWABLE_VISIBILITIES: ReadonlySet<string> = new Set([
  TrainingProductVisibility.PUBLIC,
  TrainingProductVisibility.UNLISTED,
]);

function notVisible(): never {
  // Same code/message whether the id/slug does not exist at all or exists
  // but is DRAFT/ARCHIVED/SCHOOL_ONLY/PRIVATE — RNF-001 forbids leaking existence.
  throw new SchoolError("PRODUCT_VISIBILITY_DENIED", "Este treino não está disponível.");
}

export class GetMarketplaceProductDetail {
  constructor(
    private readonly db: Pick<
      PrismaClient,
      | "trainingProduct"
      | "trainingProductVersion"
      | "coachProfile"
      | "school"
      | "marketplaceMedia"
      | "marketplaceReview"
      | "workoutTemplate"
    >,
  ) {}

  async execute(raw: unknown): Promise<MarketplaceProductDetail> {
    const { idOrSlug } = getMarketplaceProductDetailSchema.parse(raw);

    const product = ((await this.db.trainingProduct.findUnique({ where: { id: idOrSlug }, select: PRODUCT_SELECT })) ??
      (await this.db.trainingProduct.findUnique({ where: { slug: idOrSlug }, select: PRODUCT_SELECT }))) as ProductRow | null;

    if (!product) notVisible();
    if (product.status !== TrainingProductStatus.PUBLISHED) notVisible();
    // Allow-list, not a deny-list: a visibility value added later must be
    // invisible here until someone deliberately opts it in. The previous
    // `!== SCHOOL_ONLY` form would have published PRIVATE products to
    // anonymous visitors the moment that value was introduced.
    if (!PUBLICLY_VIEWABLE_VISIBILITIES.has(product.visibility)) notVisible();
    if (!product.currentVersionId) notVisible();

    const currentVersion = await this.db.trainingProductVersion.findUnique({
      where: { id: product.currentVersionId },
      select: { id: true, schemaVersion: true, planPayload: true },
    });
    if (!currentVersion) notVisible();

    const previewVersion =
      product.previewVersionId && product.previewVersionId !== currentVersion.id
        ? await this.db.trainingProductVersion.findUnique({
            where: { id: product.previewVersionId },
            select: { id: true, schemaVersion: true, planPayload: true },
          })
        : currentVersion;

    const [media, ratingAgg, coach, school] = await Promise.all([
      this.db.marketplaceMedia.findMany({
        where: { productId: product.id, access: { in: ["PUBLIC", "PREVIEW"] }, processingStatus: "READY" },
        orderBy: { sortOrder: "asc" },
        select: { id: true, kind: true, storageKey: true, thumbnailKey: true, altText: true, caption: true, access: true },
      }),
      this.db.marketplaceReview.aggregate({
        where: { productId: product.id, moderationStatus: "APPROVED" },
        _avg: { stars: true },
        _count: { _all: true },
      }),
      product.coachId
        ? this.db.coachProfile.findUnique({ where: { id: product.coachId }, select: { id: true, displayName: true, bio: true } })
        : Promise.resolve(null),
      product.schoolId
        ? this.db.school.findUnique({ where: { id: product.schoolId }, select: { id: true, name: true } })
        : Promise.resolve(null),
    ]);

    const previewWeeks = await this.buildPreviewWeeks(previewVersion ?? currentVersion);

    const reviewCount = ratingAgg._count._all;
    const author: MarketplaceProductAuthor | null = coach
      ? { kind: "coach", id: coach.id, name: coach.displayName, bio: coach.bio }
      : school
        ? { kind: "school", id: school.id, name: school.name, bio: null }
        : null;

    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      description: product.description,
      objective: product.objective,
      difficulty: product.difficulty,
      goalType: product.goalType,
      targetEventType: product.targetEventType,
      targetDistance: product.targetDistance,
      sportTypes: product.sportType ? [product.sportType] : [],
      durationWeeks: product.durationWeeks,
      sessionsPerWeek: product.sessionsPerWeek,
      sessionDurationMinMax:
        product.sessionDurationMin !== null || product.sessionDurationMax !== null
          ? { min: product.sessionDurationMin, max: product.sessionDurationMax }
          : null,
      equipment: product.equipment,
      language: product.language,
      availability: product.availability,
      publicMedia: media,
      previewWeeks,
      author,
      seller: author, // TM032 — see `seller` doc comment above (Q3/TM019).
      ratingAverage: reviewCount > 0 ? Number((ratingAgg._avg.stars ?? 0).toFixed(2)) : null,
      reviewCount,
      price: product.priceCents !== null && product.currency !== null ? { amountCents: product.priceCents, currency: product.currency } : null,
      offerTerms: { policyVersion: product.sellerPolicyVersion },
      coachingIncluded: false,
      versionId: currentVersion.id,
    };
  }

  /**
   * Takes ONLY the first week of the resolved preview version's payload —
   * the hard cap that guarantees this endpoint can never return the whole
   * plan, with or without a dedicated `previewVersionId` (design principle
   * 5 / RF-106). Live-joins `WorkoutTemplate` for titles: the current
   * `planPayload` schema (TM010) only stores `workoutTemplateId`
   * references, not a content snapshot, so a template archived after
   * publishing would show `workoutTemplate: null` here — RF-103's "survives
   * archived templates" promise is not fully met until a snapshot field is
   * added to the plan payload (flagged in the session report).
   */
  private async buildPreviewWeeks(version: { schemaVersion: number; planPayload: unknown }): Promise<MarketplacePreviewWeek[]> {
    let parsed: ReturnType<typeof parsePlanPayload>;
    try {
      parsed = parsePlanPayload(version.schemaVersion, version.planPayload);
    } catch {
      return [];
    }

    const firstWeek = parsed.weeks[0];
    if (!firstWeek) return [];

    const isV2 = version.schemaVersion >= 2;
    const templateIds = new Set<string>();
    for (const day of firstWeek.days) {
      if (isV2 && "sessions" in day) {
        for (const session of day.sessions) templateIds.add(session.workoutTemplateId);
      } else if ("workoutTemplateId" in day) {
        templateIds.add(day.workoutTemplateId);
      }
    }

    const templates = templateIds.size
      ? await this.db.workoutTemplate.findMany({
          where: { id: { in: [...templateIds] } },
          select: { id: true, title: true, description: true, sportType: true },
        })
      : [];
    const templateById = new Map(templates.map((t) => [t.id, t]));

    const days: MarketplacePreviewDay[] = firstWeek.days.map((day) => {
      if (isV2 && "sessions" in day) {
        return {
          dayOfWeek: day.dayOfWeek,
          sessions: day.sessions.map((session) => ({
            dayOfWeek: day.dayOfWeek,
            planSessionId: session.planSessionId,
            sportType: session.sportType,
            order: session.order,
            note: session.note ?? null,
            alternative: session.alternative ?? null,
            workoutTemplate: templateById.get(session.workoutTemplateId) ?? null,
          })),
        };
      }

      const legacyDay = day as { workoutTemplateId: string; dayOfWeek: number; note?: string };
      return {
        dayOfWeek: legacyDay.dayOfWeek,
        sessions: [
          {
            dayOfWeek: legacyDay.dayOfWeek,
            planSessionId: null,
            sportType: null,
            order: 0,
            note: legacyDay.note ?? null,
            alternative: null,
            workoutTemplate: templateById.get(legacyDay.workoutTemplateId) ?? null,
          },
        ],
      };
    });

    return [{ week: firstWeek.week, days }];
  }
}
