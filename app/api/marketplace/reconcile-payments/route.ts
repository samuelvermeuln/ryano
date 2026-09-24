/**
 * TM064 (RF-203) — `POST /api/marketplace/reconcile-payments`. Thin adapter
 * over `ReconcileMarketplacePayments`: an external scheduler (e.g. a Vercel
 * Cron job, or a manual admin trigger) calls this periodically to catch
 * payment events our webhook endpoint (TM061) never successfully received.
 * Not a user-facing route — protected by `MARKETPLACE_ADMIN_KEY`, same
 * pattern as `app/api/integrations/garmin/jobs/route.ts` and Strava's
 * equivalent, never a user session.
 */
import { prisma } from "@/server/db";
import { ReconcileMarketplacePayments } from "@/modules/school/application/reconcile-marketplace-payments";
import { ConfirmTrainingPurchaseFromWebhook } from "@/modules/school/application/confirm-training-purchase-from-webhook";
import { RefundTrainingPurchase } from "@/modules/school/application/refund-training-purchase";
import { StripePaymentProvider } from "@/modules/school/infrastructure/stripe-payment-provider";
import { schoolMetrics } from "@/modules/school/infrastructure/metrics";
import { schoolLogger } from "@/modules/school/infrastructure/logger";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { isAuthorizedMarketplaceJobRequest } from "./authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const provider = new StripePaymentProvider();
const reconcile = new ReconcileMarketplacePayments(
  provider,
  new ConfirmTrainingPurchaseFromWebhook(prisma),
  new RefundTrainingPurchase(prisma),
);

export async function POST(request: Request) {
  return runReconciliation(request);
}

export async function GET(request: Request) {
  return runReconciliation(request);
}

async function runReconciliation(request: Request) {
  const log = schoolLogger("marketplace-reconcile-payments");

  if (!isAuthorizedMarketplaceJobRequest(request)) {
    return Response.json({ code: "UNAUTHORIZED", message: "Não autorizado." }, { status: 401 });
  }

  try {
    assertMarketplaceEnabled();

    const summary = await reconcile.execute();

    schoolMetrics.marketplaceReconciliationRun({
      checked: summary.checked,
      confirmed: summary.confirmed,
      refunded: summary.refunded,
      alreadyProcessed: summary.alreadyProcessed,
      failedCount: summary.failed.length,
      correlationId: log.correlationId,
    });

    if (summary.failed.length > 0) {
      log.warn("reconciliation_partial_failure", { failed: summary.failed });
    } else {
      log.info("reconciliation_run", { checked: summary.checked, confirmed: summary.confirmed, refunded: summary.refunded });
    }

    return Response.json({ ok: true, ...summary }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "MARKETPLACE_DISABLED") {
      return Response.json({ code: "MARKETPLACE_DISABLED", message: "Recurso indisponível." }, { status: 404 });
    }
    log.error("reconciliation_unexpected_error", { error: error instanceof Error ? error.message : "unknown" });
    return Response.json({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." }, { status: 500 });
  }
}
