/**
 * TM030 — /professor/estudio/planos/[productId]: edição de metadados antes
 * de publicar, versionamento, preço/visibilidade e métricas agregadas
 * (RF-102/RF-103/RF-104). NUNCA mostra dado individual de comprador — a
 * seção de vendas usa exatamente o DTO de `GetProductSalesSummary` (TM023),
 * cuja forma já garante isso (ver tests/get-product-sales-summary.test.ts).
 *
 * Escopo (ver relatório final): esta task depende de TM025/TM026/TM027, não
 * de TM021 — diferente de TM029 ("novo"), que monta o plano do zero. Por
 * isso esta tela edita metadados/preço/visibilidade e versões (lista,
 * publicar), mas não reabre o editor completo de semanas/dias/sessões de um
 * produto já existente — não há rota/página no escopo TM018–TM030 para isso.
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { CanManageTrainingProduct } from "@/modules/school/application/can-manage-training-product";
import { SchoolMembershipRepository } from "@/modules/school/infrastructure/school-membership-repository";
import { GetProductSalesSummary } from "@/modules/school/application/get-product-sales-summary";
import { GetProductLedgerSummary } from "@/modules/school/application/get-product-ledger-summary";
import { ProductEditorPanel } from "./product-editor-panel";
import { PublishVersionButton } from "./publish-version-button";

export const dynamic = "force-dynamic";

const salesSummary = new GetProductSalesSummary(prisma);
const ledgerSummary = new GetProductLedgerSummary(prisma);

type PageProps = { params: Promise<{ productId: string }> };

const STATUS_LABEL: Record<string, { label: string; pill: string }> = {
  DRAFT: { label: "Rascunho", pill: "theme-pill-warning" },
  PUBLISHED: { label: "Publicado", pill: "theme-pill-success" },
  ARCHIVED: { label: "Arquivado", pill: "theme-pill-neutral" },
};

export default async function ProdutoEstudioPage({ params }: PageProps) {
  if (!isMarketplaceEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { productId } = await params;

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, status: true },
  });
  if (!coachProfile) redirect("/professor");
  if (coachProfile.status !== "ACTIVE") notFound();

  const product = await prisma.trainingProduct.findUnique({ where: { id: productId } });
  if (!product) notFound();

  // No-permission state (RNF-011/RNF-001): 404, never leak that a product
  // exists to someone who isn't its authorized author (TM018's guard, plus
  // the "is this actually MY coach-owned product" check TM020/TM022 also do).
  try {
    const guard = new CanManageTrainingProduct(prisma, new SchoolMembershipRepository(prisma));
    const { coachId } = await guard.assertAuthorCoach(session.user.id, product.schoolId);
    if (product.coachId && product.coachId !== coachId) notFound();
  } catch {
    notFound();
  }

  const versions = await prisma.trainingProductVersion.findMany({
    where: { productId: product.id },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true, publishedAt: true, changeNote: true, schemaVersion: true },
  });
  const hasDraftVersion = versions.some((v) => v.publishedAt === null);

  let sales: Awaited<ReturnType<typeof salesSummary.execute>> | null = null;
  let salesError = false;
  try {
    sales = await salesSummary.execute(session.user.id, { productId: product.id });
  } catch {
    salesError = true;
  }

  // TM068 (RF-205) — deliberately a SEPARATE fetch from `sales` above:
  // that one counts TrainingPurchase rows, this one sums SellerLedgerEntry
  // (TM067) — the numbers below must come from the ledger, never a parallel
  // UI-side recomputation.
  let ledger: Awaited<ReturnType<typeof ledgerSummary.execute>> | null = null;
  let ledgerError = false;
  try {
    ledger = await ledgerSummary.execute(session.user.id, { productId: product.id });
  } catch {
    ledgerError = true;
  }

  const status = STATUS_LABEL[product.status] ?? STATUS_LABEL.DRAFT;

  return (
    <main className="min-h-screen p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/professor/estudio/planos" className="text-muted-foreground hover:text-foreground text-sm">
            ← Meus planos
          </Link>
        </div>

        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{product.title}</h1>
              <span className={`${status.pill} rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide`}>
                {status.label}
              </span>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Vender este plano não cria vínculo de acompanhamento com o comprador (RNF-002).
            </p>
          </div>
          {hasDraftVersion && <PublishVersionButton productId={product.id} />}
        </header>

        {/* Métricas agregadas — nunca dado individual de comprador (RF-104) */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold mb-4">Vendas</h2>
          {salesError && <p className="text-sm text-destructive">Não foi possível carregar as métricas de vendas.</p>}
          {sales && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-2xl font-bold tabular-nums">{sales.totalPurchases}</p>
                <p className="text-xs text-muted-foreground">Total de compras</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{sales.completedPurchases}</p>
                <p className="text-xs text-muted-foreground">Concluídas</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{sales.activeLicenses}</p>
                <p className="text-xs text-muted-foreground">Licenças ativas</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: sales.currency ?? "BRL" }).format(sales.grossRevenueCents / 100)}
                </p>
                <p className="text-xs text-muted-foreground">Receita bruta</p>
              </div>
            </div>
          )}
        </section>

        {/* TM068 (RF-205) — painel financeiro sourced diretamente do ledger
            (SellerLedgerEntry, TM067); nunca um cálculo paralelo na UI. */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold mb-4">Financeiro (ledger)</h2>
          {ledgerError && <p className="text-sm text-destructive">Não foi possível carregar o financeiro.</p>}
          {ledger && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: ledger.currency ?? "BRL" }).format(ledger.grossCents / 100)}
                </p>
                <p className="text-xs text-muted-foreground">Bruto</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: ledger.currency ?? "BRL" }).format(ledger.feeCents / 100)}
                </p>
                <p className="text-xs text-muted-foreground">Taxa da plataforma</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: ledger.currency ?? "BRL" }).format(ledger.netCents / 100)}
                </p>
                <p className="text-xs text-muted-foreground">Líquido</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{ledger.saleEntries} / {ledger.refundEntries}</p>
                <p className="text-xs text-muted-foreground">Vendas / reembolsos no ledger</p>
              </div>
            </div>
          )}
        </section>

        {/* Metadados/preço/visibilidade (RF-102) */}
        <ProductEditorPanel
          productId={product.id}
          expectedVersion={product.updatedAt.toISOString()}
          initial={{
            title: product.title,
            description: product.description,
            sportType: product.sportType,
            durationWeeks: product.durationWeeks,
            visibility: product.visibility,
            priceCents: product.priceCents,
            currency: product.currency,
          }}
        />

        {/* Versionamento (RF-103) — somente leitura; publicar é a única mutação nesta seção */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-base font-semibold">Versões</h2>
          {versions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Este produto ainda não tem nenhuma versão de plano associada.
            </p>
          )}
          {versions.length > 0 && (
            <ul className="space-y-2">
              {versions.map((version) => (
                <li key={version.id} className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">
                      Versão {version.versionNumber}
                      {product.currentVersionId === version.id && (
                        <span className="theme-pill-success ml-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold">atual</span>
                      )}
                    </p>
                    {version.changeNote && <p className="text-xs text-muted-foreground">{version.changeNote}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {version.publishedAt ? `Publicada em ${version.publishedAt.toLocaleDateString("pt-BR")}` : "Rascunho"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
