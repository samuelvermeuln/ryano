/**
 * TM028 — /professor/estudio/planos: lista dos próprios produtos do
 * "estúdio do professor" (RF-101/RF-104), com estados vazio/erro/permissão
 * (RNF-011).
 *
 * Convenção de tela: mesma família de `/professor/independente` e
 * `/professor/buscar-escola` — um `<main>` com tokens de design (não
 * `AppShell`), já que nenhuma página do professor fora de
 * `/professor/[schoolId]/**` usa o shell persistente hoje (ele exige um
 * `schoolId` de contexto que o estúdio não tem — um coach independente não
 * tem escola nenhuma). Ver relatório final para a mesma decisão em
 * TM029/TM030.
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
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
  const session = await requireOnboardedSession({ next: "/professor/estudio/planos" });

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

  return (
    <main className="min-h-screen p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Meus planos</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Estúdio do professor — crie, edite e publique planos de treino para o marketplace.
            </p>
          </div>
          <Link
            href="/professor/estudio/planos/novo"
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90"
          >
            <IconPlus size={16} />
            Novo plano
          </Link>
        </header>

        {loadError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
            <p className="text-sm font-medium text-destructive">Não foi possível carregar seus planos.</p>
            <p className="text-sm text-foreground/70 mt-1">Atualize a página para tentar novamente.</p>
          </div>
        )}

        {!loadError && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Você ainda não criou nenhum plano.</p>
            <Link href="/professor/estudio/planos/novo" className="text-sm text-primary font-medium hover:underline">
              Criar meu primeiro plano
            </Link>
          </div>
        )}

        {!loadError && items.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((product, index) => {
              const status = STATUS_LABEL[product.status] ?? STATUS_LABEL.DRAFT;
              const sales = summaries[index];
              return (
                <li key={product.id}>
                  <Link
                    href={`/professor/estudio/planos/${product.id}`}
                    className="block rounded-xl border border-border bg-card p-5 hover:bg-muted/40 transition-colors space-y-3 h-full"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{product.title}</p>
                      <span className={`${status.pill} shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatPrice(product.priceCents, product.currency)}</p>
                    {sales && (
                      <div className="grid grid-cols-2 gap-2 text-sm pt-1 border-t border-border/60">
                        <div>
                          <p className="text-lg font-bold tabular-nums">{sales.totalPurchases}</p>
                          <p className="text-xs text-muted-foreground">Vendas</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold tabular-nums">{sales.activeLicenses}</p>
                          <p className="text-xs text-muted-foreground">Licenças ativas</p>
                        </div>
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
