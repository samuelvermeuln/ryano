import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { buildIndexableMetadata } from "@/server/seo";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { ListMarketplaceProducts, listMarketplaceProductsQuerySchema } from "@/modules/school/application/list-marketplace-products";
import { AppHeader } from "@/components/app-header";
import { AuroraBackground } from "@/components/aurora-background";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPublicAuthenticatedAppHref } from "@/server/auth-guards";
import { MarketplaceFilters } from "./marketplace-filters";
import { MarketplaceProductCard } from "./marketplace-product-card";

export const dynamic = "force-dynamic";

export const metadata = buildIndexableMetadata({
  title: "Marketplace de treinos — Ryvano",
  description: "Encontre planos de treino estruturados de professores e escolas, prontos para o seu calendário.",
  path: "/marketplace",
});

const list = new ListMarketplaceProducts(prisma);

/**
 * TM035 (RF-105) — `/marketplace`: public catalog. The query string is the
 * only state this page reads for filters/sort/page — a server component
 * re-render on navigation (`MarketplaceFilters` pushes new query strings) is
 * exactly "count and paginate on the server" (RF-105) with no separate
 * client-side fetch/store to keep in sync.
 */
export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isMarketplaceEnabled()) notFound();

  const rawParams = await searchParams;
  // Next.js can hand back an array for a repeated key — collapse to the last
  // value, same convention as `Object.fromEntries(new URL(...).searchParams)`
  // used by the API route, so page and route agree on precedence.
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[v.length - 1] : v]),
  );

  // An invalid/out-of-range query string is normalized to the default view
  // instead of ever reaching the DB query with it (RF-105 — "URL inválida é
  // normalizada sem expor rascunhos"); it is never a hard error on an HTML page.
  const parsedQuery = listMarketplaceProductsQuerySchema.safeParse(flatParams);
  const input = parsedQuery.success ? parsedQuery.data : {};

  const [{ items, nextCursor, totalCount }, authenticatedHref] = await Promise.all([
    list.execute(input),
    getPublicAuthenticatedAppHref(),
  ]);

  const currentParams = new URLSearchParams(flatParams as Record<string, string>);
  currentParams.delete("cursor");
  const nextPageHref = nextCursor
    ? `/marketplace?${new URLSearchParams({ ...Object.fromEntries(currentParams), cursor: nextCursor }).toString()}`
    : null;

  return (
    <AuroraBackground className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <AppHeader
          tagline="Treinos, saúde e alertas do seu relógio, direto no seu WhatsApp."
          navLinks={[]}
          action={
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link
                href={authenticatedHref ?? "/entrar"}
                className="glass-button rounded-full px-4 py-2 text-sm font-medium"
              >
                {authenticatedHref ? "Minha conta" : "Entrar"}
              </Link>
            </div>
          }
        />

        <header className="glass space-y-4 rounded-[24px] border border-white/10 p-6 sm:p-8">
          <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
            Marketplace
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Encontre seu próximo treino
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-foreground/68 sm:text-base">
            Planos estruturados de professores e escolas, prontos para entrar no seu calendário — com ou sem relógio.
          </p>
        </header>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <MarketplaceFilters resultCount={totalCount} />

          <section className="flex-1 space-y-6" aria-label="Resultados">
            {items.length === 0 ? (
              <div className="glass rounded-[20px] border border-white/10 p-10 text-center">
                <p className="text-base font-medium text-foreground">Nenhum treino encontrado com esses filtros.</p>
                <p className="mt-1 text-sm text-foreground/60">Tente remover algum filtro ou buscar por outro termo.</p>
                <Link href="/marketplace" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
                  Limpar filtros
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((product) => (
                  <MarketplaceProductCard key={product.id} product={product} />
                ))}
              </div>
            )}

            {nextPageHref ? (
              <div className="flex justify-center pt-2">
                <Link href={nextPageHref} className="glass-button rounded-full px-5 py-2.5 text-sm font-medium">
                  Próxima página
                </Link>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </AuroraBackground>
  );
}
