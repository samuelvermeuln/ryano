import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TrainingLicenseStatus, TrainingPurchaseStatus } from "../domain/enums";

export const listMyTrainingLicensesSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2048).optional(),
});
export type ListMyTrainingLicensesInput = z.infer<typeof listMyTrainingLicensesSchema>;

/**
 * TM040/TM043 (RF-111) — the six states "/app/planos" must be able to render
 * (`aguardando pagamento, não iniciado, em andamento, pausado, concluído,
 * reembolsado`). Computed here — once — so the route and the page agree on
 * the same mapping instead of each re-deriving it from raw enum values.
 *
 * `refunded` currently only fires from `TrainingLicenseStatus.REVOKED` or a
 * `TrainingPurchase.status = REFUNDED` on the still-pending purchase list —
 * there is no automated purchase→license revocation wiring yet (that lands
 * with the refund flow, TM065/TM066, Onda 2), so a license whose purchase
 * gets refunded later will not flip state on its own until that lands.
 */
export type TrainingPlanState =
  | "awaiting_payment"
  | "not_started"
  | "in_progress"
  | "paused"
  | "completed"
  | "refunded"
  | "expired";

export interface MyTrainingLicenseSummary {
  licenseId: string;
  productId: string;
  versionId: string;
  purchaseId: string | null;
  athleteId: string;
  status: string;
  activationMode: string | null;
  activationStatus: string;
  timezone: string | null;
  chosenStartLocalDate: string | null;
  anchorEventLocalDate: string | null;
  calendarInstantiated: boolean;
  calendarInstantiatedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
  state: TrainingPlanState;
  product: { id: string; title: string; sportType: string | null; durationWeeks: number | null } | null;
  author: { type: "coach" | "school"; name: string } | null;
}

export interface MyPendingTrainingPurchaseSummary {
  purchaseId: string;
  productId: string;
  status: string;
  pricePaid: number | null;
  currency: string | null;
  purchasedAt: Date;
  state: "awaiting_payment";
  product: { id: string; title: string; sportType: string | null; durationWeeks: number | null } | null;
}

/** Exported so /app/planos/[licenseId] (TM044) derives the exact same state instead of re-implementing this mapping. */
export function deriveLicenseState(license: {
  status: string;
  activationStatus: string;
}): TrainingPlanState {
  if (license.status === TrainingLicenseStatus.REVOKED) return "refunded";
  if (license.status === TrainingLicenseStatus.EXPIRED) return "expired";
  if (license.status === TrainingLicenseStatus.COMPLETED) return "completed";
  if (license.status === TrainingLicenseStatus.PAUSED) return "paused";
  if (license.activationStatus !== "ACTIVATED") return "not_started";
  return "in_progress";
}

/** TM040 (RF-111) — the athlete's own licenses (never another athlete's) plus pending paid purchases with no license yet. */
export class ListMyTrainingLicenses {
  constructor(private readonly db: PrismaClient) {}

  async execute(athleteId: string, raw: unknown) {
    const { limit, cursor } = listMyTrainingLicensesSchema.parse(raw);

    let cursorFilter: { id: string } | undefined;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { id: string };
        cursorFilter = { id: decoded.id };
      } catch {
        cursorFilter = undefined;
      }
    }

    const [licenseRows, pendingPurchaseRows] = await Promise.all([
      this.db.trainingLicense.findMany({
        // athleteId always comes from the session (actor), never the query
        // string or body — a guessed licenseId cannot surface another
        // athlete's row through this listing.
        where: { athleteId },
        take: limit + 1,
        skip: cursorFilter ? 1 : 0,
        cursor: cursorFilter,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: {
          id: true, productId: true, versionId: true, purchaseId: true, athleteId: true,
          status: true, activationMode: true, activationStatus: true, timezone: true,
          chosenStartLocalDate: true, anchorEventLocalDate: true,
          calendarInstantiated: true, calendarInstantiatedAt: true, completedAt: true, updatedAt: true,
          product: {
            select: {
              id: true, title: true, sportType: true, durationWeeks: true,
              coach: { select: { displayName: true } },
              school: { select: { name: true } },
            },
          },
        },
      }),
      this.db.trainingPurchase.findMany({
        where: { athleteId, status: TrainingPurchaseStatus.PENDING, licenses: { none: {} } },
        orderBy: [{ purchasedAt: "desc" }],
        take: limit,
        select: {
          id: true, productId: true, status: true, pricePaid: true, currency: true, purchasedAt: true,
          product: { select: { id: true, title: true, sportType: true, durationWeeks: true } },
        },
      }),
    ]);

    const hasMore = licenseRows.length > limit;
    const items = hasMore ? licenseRows.slice(0, limit) : licenseRows;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? Buffer.from(JSON.stringify({ id: lastItem.id })).toString("base64url")
      : null;

    const licenses: MyTrainingLicenseSummary[] = items.map((row) => ({
      licenseId: row.id,
      productId: row.productId,
      versionId: row.versionId,
      purchaseId: row.purchaseId,
      athleteId: row.athleteId,
      status: row.status,
      activationMode: row.activationMode,
      activationStatus: row.activationStatus,
      timezone: row.timezone,
      chosenStartLocalDate: row.chosenStartLocalDate,
      anchorEventLocalDate: row.anchorEventLocalDate,
      calendarInstantiated: row.calendarInstantiated,
      calendarInstantiatedAt: row.calendarInstantiatedAt,
      completedAt: row.completedAt,
      updatedAt: row.updatedAt,
      state: deriveLicenseState(row),
      product: row.product ? {
        id: row.product.id, title: row.product.title, sportType: row.product.sportType, durationWeeks: row.product.durationWeeks,
      } : null,
      author: row.product?.coach
        ? { type: "coach", name: row.product.coach.displayName }
        : row.product?.school
          ? { type: "school", name: row.product.school.name }
          : null,
    }));

    const pendingPurchases: MyPendingTrainingPurchaseSummary[] = pendingPurchaseRows.map((row) => ({
      purchaseId: row.id,
      productId: row.productId,
      status: row.status,
      pricePaid: row.pricePaid,
      currency: row.currency,
      purchasedAt: row.purchasedAt,
      state: "awaiting_payment",
      product: row.product ? {
        id: row.product.id, title: row.product.title, sportType: row.product.sportType, durationWeeks: row.product.durationWeeks,
      } : null,
    }));

    return { licenses, pendingPurchases, nextCursor };
  }
}
