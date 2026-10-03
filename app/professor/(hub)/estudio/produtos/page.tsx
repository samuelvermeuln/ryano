/**
 * TM028 — /professor/estudio/produtos: lista dos próprios produtos do
 * "estúdio do professor" (RF-101/RF-104), com estados vazio/erro/permissão
 * (RNF-011).
 *
 * Convenção de tela: vive no grupo `(hub)` do professor (SAM-10), dentro do
 * shell padrão da Ryvano com a navegação do contexto Professor, e usa o
 * design system da Ryvano (`PageHeader`, `StatTiles`, `SectionCard`,
 * `EmptyState`).
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import { EmptyState } from "@/components/empty-state";
import { ITEM_CLASS, PAGE_CLASS, PageHeader, PRIMARY_ACTION_CLASS } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { GetProductSalesSummary } from "@/modules/school/application/get-product-sales-summary";
import { ListOwnTrainingProducts } from "@/modules/school/application/list-own-training-products";

export const dynamic = "force-dynamic";

const listOwn = new ListOwnTrainingProducts(prisma);
const salesSummary = new GetProductSalesSummary(prisma);

const STATUS_LABEL: Record<string, { label: string; pill: string }> = {
  DRAFT: { label: "Rascunho", pill: "theme-pill-warning" },
  PUBLISHED: { label: "Publicado", pill: "theme-pill-success" },
  ARCHIVED: { label: "Arquivado", pill: "theme-pill-neutral" },
};

function formatPrice(priceCents: number | null, currency: string | null) {
  if (priceCents === null) return "Gratuito";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency ?? "BRL" }).format(priceCents / 100);
}

export default async function EstudioPlanosPage() {
  // RNF-009 — flag desligada responde 404 seguro, mesma convenção de SCHOOL_MODULE_ENABLED.
  if (!isMarketplaceEnabled()) notFound();
  const session = await requireOnboardedSession({ next: "/professor/estudio/produtos" });

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, status: true },
  });
  // Sem CoachProfile → onboarding de professor, não um erro.
  if (!coachProfile) redirect("/professor");
  // CoachProfile suspenso/inativo → estado de sem-permissão (RNF-011): 404, não vazar existência da tela.
  if (coachProfile.status !== "ACTIVE") notFound();

  let items: Awaited<ReturnType<typeof listOwn.execute>>["items"] = [];
  let loadError = false;
  try {
    ({ items } = await listOwn.execute(session.user.id, {}));
  } catch {
    loadError = true;
  }

  const summaries = loadError ? [] : await Promise.all(
    items.map(async (product) => {
      try {
        return await salesSummary.execute(session.user.id, { productId: product.id });
      } catch {
        return null;
      }
    }),
  );

  const published = items.filter((product) => product.status === "PUBLISHED").length;
  const drafts = items.filter((product) => product.status === "DRAFT").length;
  const totalSales = summaries.reduce((sum, summary) => sum + (summary?.totalPurchases ?? 0), 0);
  const activeLicenses = summaries.reduce((sum, summary) => sum + (summary?.activeLicenses ?? 0), 0);

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Meus produtos"
        description="Gestão do que você vende no Marketplace — crie, edite e publique seus planos de treino como produtos."
        actions={(
          <Link href="/professor/estudio/produtos/novo" className={PRIMARY_ACTION_CLASS}>
            <IconPlus size={16} />
            Novo produto
          </Link>
        )}
      />

      {!loadError && items.length > 0 && (
        <StatTiles
          items={[
            { label: "Produtos", value: items.length },
            { label: "Publicados", value: published, tone: published > 0 ? "success" : "neutral" },
            { label: "Rascunhos", value: drafts, tone: drafts > 0 ? "warning" : "neutral", hint: drafts > 0 ? "Ainda não visíveis no Marketplace" : undefined },
            { label: "Vendas", value: totalSales, hint: `${activeLicenses} licença(s) ativa(s)` },
          ]}
        />
      )}

      {loadError && (
        <div className="theme-panel-danger rounded-[20px] border p-5" role="alert">
          <p className="text-sm font-medium">Não foi possível carregar seus produtos.</p>
          <p className="mt-1 text-sm text-foreground/70">Atualize a página para tentar novamente.</p>
        </div>
      )}

      {!loadError && items.length === 0 && (
        <EmptyState
          title="Você ainda não cadastrou nenhum produto"
          description="Um produto é um plano de treino que você publica no Marketplace para atletas comprarem e seguirem."
          action={(
            <Link href="/professor/estudio/produtos/novo" className={PRIMARY_ACTION_CLASS}>
              Cadastrar meu primeiro produto
            </Link>
          )}
        />
      )}

      {!loadError && items.length > 0 && (
        <SectionCard title={`Produtos (${items.length})`} description="Abra um produto para editar o plano, o preço e publicar uma nova versão.">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((product, index) => {
              const status = STATUS_LABEL[product.status] ?? STATUS_LABEL.DRAFT;
              const sales = summaries[index];
              return (
                <li key={product.id}>
                  <Link
                    href={`/professor/estudio/produtos/${product.id}`}
                    className={`${ITEM_CLASS} block h-full space-y-3 transition-colors hover:bg-white/10`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{product.title}</p>
                      <span className={`${status.pill} shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/55">{formatPrice(product.priceCents, product.currency)}</p>
                    {sales && (
                      <dl className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-sm">
                        <div>
                          <dd className="text-lg font-semibold tabular-nums">{sales.totalPurchases}</dd>
                          <dt className="text-xs text-foreground/55">Vendas</dt>
                        </div>
                        <div>
                          <dd className="text-lg font-semibold tabular-nums">{sales.activeLicenses}</dd>
                          <dt className="text-xs text-foreground/55">Licenças ativas</dt>
                        </div>
                      </dl>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
