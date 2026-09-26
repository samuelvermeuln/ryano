/**
 * TM046 (RF-105, P2) — "/escola/[schoolId]/marketplace": products commercially
 * owned by this school, their authors, and aggregate sales summaries.
 * OWNER/ADMIN only (enforced both by the shared `/escola/[schoolId]` layout
 * AND independently by `ListSchoolMarketplaceProducts` — defense in depth,
 * same discipline TM042 already uses for license activation). No buyer
 * outside the school (or any buyer at all) is ever listed — RF-104's
 * aggregate-only boundary, not a filter that could be bypassed.
 *
 * The one place an individual person appears is the PRIVATE allow-list, and
 * that is deliberate: it lists who was *granted access*, which the manager
 * themselves chose, never who bought or paid.
 */
import { notFound } from "next/navigation";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { buildNoIndexMetadata } from "@/server/seo";
import { ListSchoolMarketplaceProducts } from "@/modules/school/application/list-school-marketplace-products";
import { GetSchoolMarketplaceOverview } from "@/modules/school/application/get-school-marketplace-overview";
import { isRyvanoSportType, getRyvanoSportLabel } from "@/modules/shared/activities/sport-types";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import { EmptyState } from "@/components/empty-state";
import { formatMoney } from "@/modules/school/presentation/format";
import { ProductsPanel, type AudienceEntry, type ProductRow } from "./products-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await params;
  return buildNoIndexMetadata({
    title: "Marketplace da escola — Ryvano",
    description: "Produtos, autores e vendas do marketplace de planos de treino.",
    path: `/escola/${schoolId}/marketplace`,
  });
}

const list = new ListSchoolMarketplaceProducts(prisma);
const overview = new GetSchoolMarketplaceOverview(prisma);

function sportLabel(sportType: string | null): string {
  if (!sportType) return "—";
  return isRyvanoSportType(sportType) ? getRyvanoSportLabel(sportType) : sportType;
}

export default async function EscolaMarketplacePage({ params }: { params: Promise<{ schoolId: string }> }) {
  // The layout already 404s/redirects non-OWNER/ADMIN before this renders;
  // the flag check stays here too since a page can be reached without
  // re-running the layout's own gate in every Next.js render path.
  if (!isMarketplaceEnabled()) notFound();

  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const [{ items }, summary] = await Promise.all([
    list.execute(session.user.id, { schoolId }),
    overview.execute(session.user.id, { schoolId }),
  ]);

  // Only PRIVATE products have an allow-list worth loading, so this query is
  // skipped entirely for schools that never use that visibility.
  const privateProductIds = items
    .filter((product) => product.visibility === "PRIVATE")
    .map((product) => product.id);

  const audienceRows = privateProductIds.length
    ? await prisma.trainingProductAudience.findMany({
        where: { productId: { in: privateProductIds } },
        select: {
          productId: true, athleteId: true, revokedAt: true,
          athlete: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const audienceByProduct = new Map<string, AudienceEntry[]>();
  for (const row of audienceRows) {
    const entries = audienceByProduct.get(row.productId) ?? [];
    entries.push({
      athleteId: row.athleteId,
      name: row.athlete.name ?? row.athlete.email ?? "Sem nome",
      email: row.athlete.email,
      revoked: row.revokedAt !== null,
    });
    audienceByProduct.set(row.productId, entries);
  }

  const products: ProductRow[] = items.map((product) => ({
    id: product.id,
    title: product.title,
    sportLabel: sportLabel(product.sportType),
    status: product.status,
    visibility: product.visibility,
    priceCents: product.priceCents,
    currency: product.currency,
    authorName: product.author?.name ?? null,
    expectedVersion: product.updatedAt.toISOString(),
    completedPurchases: product.sales.completedPurchases,
    pendingPurchases: product.sales.pendingPurchases,
    activeLicenses: product.sales.activeLicenses,
    totalViews: product.views.totalViews,
    viewsLast30Days: product.views.last30Days,
    netCents: product.ledger?.netCents ?? null,
    audience: audienceByProduct.get(product.id) ?? [],
  }));

  const feePercent = (summary.money.platformFeeBps / 100).toFixed(1).replace(".", ",");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Marketplace</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Produtos de titularidade desta escola. Defina quem pode ver cada plano, ajuste preços e
          acompanhe visualizações e vendas.
        </p>
      </div>

      <StatTiles
        items={[
          {
            label: "Publicados",
            value: summary.products.published,
            hint: `${summary.products.draft} rascunho(s), ${summary.products.archived} arquivado(s)`,
          },
          {
            label: "Vendas",
            value: summary.sales.completedPurchases,
            hint:
              summary.sales.pendingPurchases > 0
                ? `${summary.sales.pendingPurchases} pendente(s)`
                : `${summary.sales.activeLicenses} licença(s) ativa(s)`,
          },
          {
            label: "Visualizações 30d",
            value: summary.views.last30Days,
            hint: `${summary.views.totalViews} no total`,
          },
          {
            label: "Você recebe",
            value: formatMoney(summary.money.netCents, summary.money.currency),
            tone: summary.money.netCents > 0 ? "success" : "neutral",
            hint: `Bruto ${formatMoney(summary.money.grossCents, summary.money.currency)} · taxa ${feePercent}%`,
          },
        ]}
      />

      {summary.payout === null ? (
        <div className="theme-panel-warning rounded-2xl border p-4">
          <p className="text-sm font-semibold">Conta de recebimento não configurada</p>
          <p className="mt-1 text-xs">
            As vendas continuam sendo registradas, mas o repasse só é liberado depois que a conta de
            recebimento da escola for cadastrada e verificada.
          </p>
        </div>
      ) : (
        summary.payout.kycStatus !== "VERIFIED" && (
          <div className="theme-panel-warning rounded-2xl border p-4">
            <p className="text-sm font-semibold">Verificação de recebimento pendente</p>
            <p className="mt-1 text-xs">
              Provedor {summary.payout.provider} · situação {summary.payout.kycStatus}. O valor
              líquido fica acumulado até a verificação ser concluída.
            </p>
          </div>
        )
      )}

      {products.length === 0 ? (
        <EmptyState
          title="Nenhum produto ainda"
          description="Quando um professor desta escola publicar um plano em nome dela, ele aparece aqui com vendas e visualizações."
        />
      ) : (
        <SectionCard
          title={`Produtos (${products.length})`}
          description="Use Gerenciar para mudar quem vê o plano, ajustar o preço ou liberar acesso a atletas específicos."
        >
          <ProductsPanel schoolId={schoolId} products={products} />
        </SectionCard>
      )}
    </div>
  );
}
