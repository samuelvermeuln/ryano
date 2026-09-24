/**
 * TM063 (RF-201) — `/marketplace/[idDoTreino]/checkout`: the page Stripe's
 * `success_url`/`cancel_url` (TM062) redirect back to. This page NEVER
 * activates anything on its own — it only reads the purchase's CURRENT
 * server-side state and displays it. A redirect happening at all is not
 * confirmation; only `ConfirmTrainingPurchaseFromWebhook` (TM060) promotes a
 * purchase to COMPLETED. `result` in the query string is purely cosmetic
 * (which button the athlete clicked on Stripe's page) — never trusted as a
 * source of truth.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconCheck, IconClock, IconX } from "@tabler/icons-react";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { buildNoIndexMetadata } from "@/server/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return buildNoIndexMetadata({
    title: "Checkout — Ryvano",
    description: "Estado da sua compra.",
    path: "/marketplace",
  });
}

/**
 * Data-loading extracted for testability (same pattern as `loadPlanoDetail`
 * in `app/app/planos/[licenseId]/page.tsx`). Ownership enforced in the query
 * itself — a purchaseId belonging to another athlete resolves to `null`,
 * indistinguishable from a nonexistent one (RNF-001).
 */
export async function loadCheckoutStatus(athleteId: string, purchaseId: string) {
  const purchase = await prisma.trainingPurchase.findFirst({
    where: { id: purchaseId, athleteId },
    select: {
      id: true, status: true, productId: true, pricePaid: true, currency: true,
      product: { select: { title: true } },
    },
  });
  if (!purchase) return null;

  const license = await prisma.trainingLicense.findFirst({
    where: { purchaseId: purchase.id },
    select: { id: true },
  });

  return { purchase, license };
}

export default async function MarketplaceCheckoutStatusPage({
  params, searchParams,
}: {
  params: Promise<{ idDoTreino: string }>;
  searchParams: Promise<{ purchaseId?: string; result?: string }>;
}) {
  if (!isMarketplaceEnabled()) notFound();

  const session = await requireOnboardedSession();
  const { idDoTreino } = await params;
  const { purchaseId } = await searchParams;

  if (!purchaseId) notFound();

  const data = await loadCheckoutStatus(session.user.id, purchaseId);
  if (!data) notFound();
  const { purchase, license } = data;

  const priceLabel = purchase.pricePaid !== null
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: purchase.currency ?? "BRL" }).format(purchase.pricePaid / 100)
    : "Gratuito";

  return (
    <main className="min-h-screen p-6 md:p-12">
      <div className="mx-auto max-w-xl space-y-6">
        <Link href={`/marketplace/${idDoTreino}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/50 hover:text-foreground/80">
          <IconArrowLeft size={14} /> Voltar ao plano
        </Link>

        <section className="rounded-[24px] border border-white/10 bg-white/[0.05] p-6 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-foreground/40">Checkout</p>
            <h1 className="mt-1 text-xl font-bold">{purchase.product?.title ?? "Plano de treino"}</h1>
            <p className="mt-1 text-sm text-foreground/60">{priceLabel}</p>
          </div>

          {purchase.status === "COMPLETED" ? (
            <div className="theme-panel-success flex items-start gap-3 rounded-2xl border p-4 text-sm">
              <IconCheck size={20} className="mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p>Pagamento confirmado. Seu plano já está disponível.</p>
                {license ? (
                  <Link href={`/app/planos/${license.id}`} className="font-medium text-accent hover:underline">
                    Abrir meu plano
                  </Link>
                ) : (
                  <Link href="/app/planos" className="font-medium text-accent hover:underline">
                    Ver meus planos
                  </Link>
                )}
              </div>
            </div>
          ) : purchase.status === "PENDING" ? (
            <div className="theme-panel-warning flex items-start gap-3 rounded-2xl border p-4 text-sm">
              <IconClock size={20} className="mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p>Aguardando confirmação do pagamento. Isso costuma levar poucos segundos.</p>
                <p className="text-xs text-foreground/50">
                  Esta página consulta o servidor — ela nunca libera o plano por conta própria.
                  Atualize para verificar novamente.
                </p>
                <a
                  href={`/marketplace/${idDoTreino}/checkout?purchaseId=${purchaseId}`}
                  className="inline-block font-medium text-accent hover:underline"
                >
                  Atualizar estado
                </a>
              </div>
            </div>
          ) : purchase.status === "REFUNDED" ? (
            <div className="theme-panel-neutral flex items-start gap-3 rounded-2xl border p-4 text-sm">
              <IconX size={20} className="mt-0.5 shrink-0" />
              <p>Esta compra foi reembolsada.</p>
            </div>
          ) : (
            <div className="theme-panel-neutral flex items-start gap-3 rounded-2xl border p-4 text-sm">
              <IconX size={20} className="mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p>Pagamento não concluído. Nenhuma cobrança foi feita.</p>
                <Link href={`/marketplace/${idDoTreino}`} className="font-medium text-accent hover:underline">
                  Tentar novamente
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
