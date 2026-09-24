/**
 * TM046 (RF-105, P2) — "/escola/[schoolId]/marketplace": products commercially
 * owned by this school, their authors, and aggregate sales summaries.
 * OWNER/ADMIN only (enforced both by the shared `/escola/[schoolId]` layout
 * AND independently by `ListSchoolMarketplaceProducts` — defense in depth,
 * same discipline TM042 already uses for license activation). No buyer
 * outside the school (or any buyer at all) is ever listed — RF-104's
 * aggregate-only boundary, not a filter that could be bypassed.
 */
import { notFound } from "next/navigation";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { buildNoIndexMetadata } from "@/server/seo";
import { ListSchoolMarketplaceProducts, type SchoolMarketplaceProductSummary } from "@/modules/school/application/list-school-marketplace-products";
import { isRyvanoSportType, getRyvanoSportLabel } from "@/modules/shared/activities/sport-types";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";

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

const STATUS_LABEL: Record<string, string> = { DRAFT: "Rascunho", PUBLISHED: "Publicado", ARCHIVED: "Arquivado" };
const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  DRAFT: "warning",
  PUBLISHED: "success",
  ARCHIVED: "neutral",
};

function sportLabel(sportType: string | null): string {
  if (!sportType) return "—";
  return isRyvanoSportType(sportType) ? getRyvanoSportLabel(sportType) : sportType;
}

function formatPrice(priceCents: number | null, currency: string | null): string {
  if (priceCents === null) return "Grátis";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency ?? "BRL" }).format(priceCents / 100);
}

export default async function EscolaMarketplacePage({ params }: { params: Promise<{ schoolId: string }> }) {
  // The layout already 404s/redirects non-OWNER/ADMIN before this renders;
  // the flag check stays here too since a page can be reached without
  // re-running the layout's own gate in every Next.js render path.
  if (!isMarketplaceEnabled()) notFound();

  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const { items } = await list.execute(session.user.id, { schoolId });

  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <EmptyState
          title="Marketplace"
          description="Nenhum produto foi publicado em nome desta escola ainda."
        />
      ) : (
        <SectionCard title="Marketplace" description="Produtos de titularidade desta escola, autores e vendas agregadas">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs text-foreground/50 uppercase tracking-wide">
                  <th className="py-3 pr-4 font-medium">Produto</th>
                  <th className="py-3 pr-4 font-medium">Autor</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium">Preço</th>
                  <th className="py-3 pr-4 font-medium text-right">Vendas</th>
                  <th className="py-3 pr-4 font-medium text-right">Licenças ativas</th>
                  <th className="py-3 pr-4 font-medium text-right">Receita bruta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((product) => (
                  <ProductRow key={product.id} product={product} />
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function ProductRow({ product }: { product: SchoolMarketplaceProductSummary }) {
  return (
    <tr className="hover:bg-white/[0.02] transition-colors">
      <td className="py-3 pr-4">
        <p className="font-medium">{product.title}</p>
        <p className="text-xs text-foreground/40">{sportLabel(product.sportType)}</p>
      </td>
      <td className="py-3 pr-4 text-foreground/60">{product.author?.name ?? "—"}</td>
      <td className="py-3 pr-4">
        <StatusBadge tone={STATUS_TONE[product.status] ?? "neutral"}>
          {STATUS_LABEL[product.status] ?? product.status}
        </StatusBadge>
      </td>
      <td className="py-3 pr-4 text-foreground/60">{formatPrice(product.priceCents, product.currency)}</td>
      <td className="py-3 pr-4 text-right text-foreground/60">{product.sales.completedPurchases}</td>
      <td className="py-3 pr-4 text-right text-foreground/60">{product.sales.activeLicenses}</td>
      <td className="py-3 pr-4 text-right text-foreground/60">{formatPrice(product.sales.grossRevenueCents, product.currency)}</td>
    </tr>
  );
}
