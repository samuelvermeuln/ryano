import type { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { TrainingPurchaseStatus, TrainingLicenseStatus } from "../domain/enums";
import { schoolMetrics } from "../infrastructure/metrics";
import { recordMarketplaceRefundLedgerEntry } from "./record-marketplace-ledger-entry";

export interface RefundTrainingPurchaseRepository {
  trainingPurchase: Pick<PrismaClient["trainingPurchase"], "findFirst" | "findUnique" | "update">;
  trainingLicense: Pick<PrismaClient["trainingLicense"], "findFirst" | "update">;
  adminAuditLog: Pick<PrismaClient["adminAuditLog"], "create">;
  sellerLedgerEntry: Pick<PrismaClient["sellerLedgerEntry"], "create" | "findFirst">;
  $transaction: PrismaClient["$transaction"];
}

const adminRefundSchema = z.strictObject({
  purchaseId: z.string().min(1),
  reason: z.string().min(1).max(1000),
});

export type RefundTrainingPurchaseInput =
  | { kind: "provider_event"; event: Stripe.Event }
  | { kind: "admin_action"; actorUserId: string; purchaseId: string; reason: string };

/**
 * TM065 (RF-204) — refund only from a verified provider event or an audited
 * administrative action — never a client-supplied "I refunded this" claim.
 * Revokes the right to create FUTURE sessions (the license moves to
 * REVOKED) without deleting any already-executed session, history, or
 * authorship. Idempotent: a purchase that is already REFUNDED is a no-op.
 */
export class RefundTrainingPurchase {
  constructor(
    private readonly db: RefundTrainingPurchaseRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: RefundTrainingPurchaseInput) {
    const now = this.clock();

    const { purchaseId, refundReason, actorLabel } = await this.resolveTarget(input);

    return this.db.$transaction(async (tx) => {
      const purchase = await tx.trainingPurchase.findUnique({
        where: { id: purchaseId },
        select: { id: true, status: true },
      });
      if (!purchase) {
        throw new SchoolError("PRODUCT_NOT_FOUND", "Compra não encontrada para reembolso.", 404);
      }
      // Idempotent: a second refund event/action for an already-REFUNDED
      // purchase is a no-op, not an error (RF-203's discipline extended to refunds).
      if (purchase.status === TrainingPurchaseStatus.REFUNDED) {
        return { alreadyRefunded: true as const, purchaseId };
      }
      if (purchase.status !== TrainingPurchaseStatus.COMPLETED) {
        throw new SchoolError("PRODUCT_NOT_AVAILABLE", "Só é possível reembolsar uma compra concluída.", 409);
      }

      await tx.trainingPurchase.update({
        where: { id: purchaseId },
        data: { status: TrainingPurchaseStatus.REFUNDED, refundReason, updatedAt: now },
      });

      // Revokes the RIGHT TO USE going forward; never touches
      // WorkoutAssignment/WorkoutExecution rows — past sessions and their
      // history/authorship are untouched (RF-204's explicit requirement).
      const license = await tx.trainingLicense.findFirst({
        where: { purchaseId },
        select: { id: true, status: true },
      });
      if (license && license.status !== TrainingLicenseStatus.REVOKED) {
        await tx.trainingLicense.update({
          where: { id: license.id },
          data: { status: TrainingLicenseStatus.REVOKED, revokedAt: now, updatedAt: now },
        });
      }

      // TM067 (RF-205) — reverses the purchase's own SALE ledger entry
      // exactly (never recomputed from whatever fee config is in effect
      // now); a no-op when there is none (e.g. a purchase confirmed before
      // TM067 shipped) — refund itself still proceeds either way.
      await recordMarketplaceRefundLedgerEntry(tx, purchaseId);

      // RF-204 — "ação administrativa auditada": the metric below is
      // fire-and-forget (never a durable record, see metrics.ts doc
      // comment), so the audit trail this requirement actually needs is
      // this `AdminAuditLog` row — same model/convention already used by
      // `school-service.ts` for other admin actions, not a bespoke table.
      if (input.kind === "admin_action") {
        await tx.adminAuditLog.create({
          data: {
            actorUserId: input.actorUserId,
            action: "MARKETPLACE_PURCHASE_REFUNDED",
            entityType: "TrainingPurchase",
            entityId: purchaseId,
            createdAt: now,
            metadata: { reason: refundReason, licenseId: license?.id ?? null },
          },
        });
      }

      schoolMetrics.marketplaceRefundProcessed({
        purchaseId,
        reason: input.kind === "provider_event" ? "provider_event" : "admin_action",
        actorUserId: input.kind === "admin_action" ? input.actorUserId : undefined,
      });

      return { alreadyRefunded: false as const, purchaseId, licenseId: license?.id ?? null, refundReason: refundReason ?? actorLabel };
    });
  }

  private async resolveTarget(
    input: RefundTrainingPurchaseInput,
  ): Promise<{ purchaseId: string; refundReason: string; actorLabel: string }> {
    if (input.kind === "admin_action") {
      const parsed = adminRefundSchema.parse({ purchaseId: input.purchaseId, reason: input.reason });
      return { purchaseId: parsed.purchaseId, refundReason: parsed.reason, actorLabel: `admin:${input.actorUserId}` };
    }

    // provider_event — refund.created (Stripe's current recommended event,
    // NOT the older charge.refunded; see STATUS.md §4.3). The Refund object
    // carries `payment_intent`, which we stored as TrainingPurchase.paymentRef
    // at confirmation time (TM060) — that is the only link back to our row.
    const refund = input.event.data.object as Stripe.Refund;
    const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
    if (!paymentIntentId) {
      throw new SchoolError("PURCHASE_IDEMPOTENCY_CONFLICT", "Evento de reembolso sem payment_intent associado.", 409);
    }
    const purchase = await this.db.trainingPurchase.findFirst({
      where: { paymentRef: paymentIntentId },
      select: { id: true },
    });
    if (!purchase) {
      throw new SchoolError("PRODUCT_NOT_FOUND", "Compra não encontrada para o payment_intent do reembolso.", 404);
    }
    return { purchaseId: purchase.id, refundReason: `stripe:${refund.id}`, actorLabel: "provider_event" };
  }
}
