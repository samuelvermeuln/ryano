/**
 * Seller panel for the coach's own marketplace catalogue.
 *
 * Lives under `/professor/[schoolId]/**` so it inherits the coach shell's
 * navigation, but shows products the coach owns *personally* — the school's own
 * catalogue has its own panel under `/escola/[schoolId]/marketplace`, backed by
 * a different `SellerAccount`. The header states this, because "minhas vendas"
 * and "vendas da escola" are two different pockets and a seller reading the
 * wrong one would misjudge their own earnings.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { GetCoachMarketplaceOverview } from "@/modules/school/application/get-coach-marketplace-overview";
import { formatMoney } from "@/modules/school/presentation/format";
import { StatTiles } from "@/components/stat-tiles";
import { EmptyState } from "@/components/empty-state";
import { SellerPanel, type SellerAudienceEntry, type SellerProductRow } from "./seller-panel";

export const dynamic = "force-dynamic";

const overviewUseCase = new GetCoachMarketplaceOverview(prisma);

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function ProfessorMarketplacePage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  // The marketplace has its own flag: the coach panel must disappear with it,
  // the same way the studio does, instead of rendering an empty shell.
  if (!isMarketplaceEnabled()) notFound();

  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  let overview: Awaited<ReturnType<typeof overviewUseCase.execute>> | null = null;
  let loadError = false;
  try {
    overview = await overviewUseCase.execute({ actorUserId: session.user.id });
  } catch {
    loadError = true;
  }

  if (loadError || overview === null) {
    return (
      <div className="space-y-6 p-6 md:p-10">
        <h1 className="text-xl font-semibold">Minhas vendas</h1>
        <div className="theme-panel-warning rounded-2xl border p-4">
          <p className="text-sm font-semibold">Não foi possível carregar suas vendas.</p>
          <p className="mt-1 text-xs">Atualize a página para tentar novamente.</p>
        </div>
      </div>
    );
  }

  // Only PRIVATE products have an allow-list worth loading, so this query is
  // skipped entirely for coaches who never use that visibility.
  const privateProductIds = overview.rows
    .filter((row) => row.visibility === "PRIVATE")
    .map((row) => row.id);

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

  const audienceByProduct = new Map<string, SellerAudienceEntry[]>();
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

  const products: SellerProductRow[] = overview.rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    visibility: row.visibility,
    priceCents: row.priceCents,
    currency: row.currency,
    expectedVersion: row.updatedAt.toISOString(),
    completedPurchases: row.completedPurchases,
    refundedPurchases: row.refundedPurchases,
    activeLicenses: row.activeLicenses,
    totalViews: row.totalViews,
    views30d: row.views30d,
    conversionPct: row.conversionPct,
    netCents: row.netCents,
    audience: audienceByProduct.get(row.id) ?? [],
  }));

  const feePercent = (overview.money.platformFeeBps / 100).toFixed(1).replace(".", ",");

  return (
    <div className="space-y-6 p-6 md:p-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Minhas vendas</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Produtos publicados por você no marketplace. Vendas em nome da escola aparecem no painel da
            escola, não aqui.
          </p>
        </div>
        {/* SAM-12 — o Marketplace é vitrine/vendas; a gestão vive em "Meus produtos". Estes são atalhos. */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/professor/estudio/produtos"
            className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-foreground/85 hover:bg-white/10"
          >
            Meus produtos
          </Link>
          <Link
            href="/professor/estudio/produtos/novo"
            className="glass-button rounded-full px-4 py-2 text-sm font-semibold"
          >
            Novo produto
          </Link>
        </div>
      </div>

      <StatTiles
        items={[
          {
            label: "Publicados",
            value: overview.products.published,
            hint: `${overview.products.draft} rascunho(s), ${overview.products.archived} arquivado(s)`,
          },
          {
            label: "Vendas",
            value: overview.sales.completedPurchases,
            hint:
              overview.sales.refundedPurchases > 0
                ? `${overview.sales.refundedPurchases} reembolsada(s)`
                : `${overview.sales.activeLicenses} licença(s) ativa(s)`,
          },
          {
            label: "Acessos 30d",
            value: overview.views.last30Days,
            hint: `${overview.views.totalViews} no total`,
          },
          {
            label: "Você recebe",
            value: formatMoney(overview.money.netCents, overview.money.currency),
            tone: overview.money.netCents > 0 ? "success" : "neutral",
            hint: `Bruto ${formatMoney(overview.money.grossCents, overview.money.currency)} · taxa ${feePercent}%`,
          },
        ]}
      />

      {/* SAM-13 — o cadastro vive no Perfil; aqui só o alerta contextual com o atalho. */}
      {overview.payout === null || !overview.payout.hasPayoutAccount ? (
        <div className="theme-panel-warning rounded-2xl border p-4">
          <p className="text-sm font-semibold">Conta de recebimento não configurada</p>
          <p className="mt-1 text-xs">
            Suas vendas continuam sendo registradas, mas o repasse está pendente até a conta de
            recebimento ser cadastrada e verificada.
          </p>
          <Link href="/app/perfil#recebimento" className="mt-3 inline-block text-xs font-semibold underline underline-offset-4">
            Configurar no Perfil
          </Link>
        </div>
      ) : (
        overview.payout.kycStatus !== "VERIFIED" && (
          <div className="theme-panel-warning rounded-2xl border p-4">
            <p className="text-sm font-semibold">Verificação de recebimento pendente</p>
            <p className="mt-1 text-xs">
              O provedor ainda não liberou os repasses. O valor líquido fica acumulado até a
              verificação ser concluída.
            </p>
            <Link href="/app/perfil#recebimento" className="mt-3 inline-block text-xs font-semibold underline underline-offset-4">
              Acompanhar no Perfil
            </Link>
          </div>
        )
      )}

      {products.length === 0 ? (
        <EmptyState
          title="Você ainda não publicou produtos"
          description="Cadastre um produto em Meus produtos, defina preço e visibilidade, e ele passa a aparecer aqui com acessos e vendas."
          action={<Link href="/professor/estudio/produtos/novo" className="glass-button rounded-full px-4 py-2 text-sm font-semibold">Cadastrar meu primeiro produto</Link>}
        />
      ) : (
        <SellerPanel schoolId={schoolId} products={products} />
      )}
    </div>
  );
}
