import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconStar } from "@tabler/icons-react";
import { prisma } from "@/server/db";
import { buildIndexableMetadata, buildNoIndexMetadata } from "@/server/seo";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { GetMarketplaceProductDetail } from "@/modules/school/application/get-marketplace-product-detail";
import { getRyvanoSportLabel, isRyvanoSportType } from "@/modules/shared/activities/sport-types";
import { buildMarketplaceCallbackUrl, MarketplaceCallbackIntent } from "@/modules/school/domain/marketplace-callback-url";
import { AppHeader } from "@/components/app-header";
import { AuroraBackground } from "@/components/aurora-background";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPublicSession } from "@/server/auth-guards";
import { PurchaseCta } from "./purchase-cta";

export const dynamic = "force-dynamic";

const detailUseCase = new GetMarketplaceProductDetail(prisma);

type PageParams = { idDoTreino: string };

/**
 * Memoized per-request (React `cache`) so `generateMetadata` and the page
 * body share one DB round trip instead of two, and — the load-bearing part
 * of TM034's own criterion — so there is exactly ONE authorization-aware
 * query for this product per request. Metadata is built from its result,
 * never from a second, unguarded lookup that could disagree with the page
 * body about whether this product is visible.
 */
const loadDetail = cache(async (idDoTreino: string) => {
  try {
    return await detailUseCase.execute({ idOrSlug: idDoTreino });
  } catch {
    return null;
  }
});

function formatPrice(price: { amountCents: number; currency: string } | null) {
  if (!price) return "Grátis";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: price.currency }).format(price.amountCents / 100);
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { idDoTreino } = await params;

  if (!isMarketplaceEnabled()) {
    return buildNoIndexMetadata({ title: "Treino não encontrado — Ryvano", description: "Este treino não está disponível.", path: `/marketplace/${idDoTreino}` });
  }

  const product = await loadDetail(idDoTreino);
  if (!product) {
    // Same generic copy whether the product does not exist or is
    // DRAFT/ARCHIVED/SCHOOL_ONLY — the metadata must not hint at which one
    // (TM034's own criterion: never reveal a private/SCHOOL_ONLY product).
    return buildNoIndexMetadata({ title: "Treino não encontrado — Ryvano", description: "Este treino não está disponível.", path: `/marketplace/${idDoTreino}` });
  }

  return buildIndexableMetadata({
    title: `${product.title} — Ryvano Marketplace`,
    description: product.description?.slice(0, 200) || `Plano de treino ${product.title} no Ryvano Marketplace.`,
    path: `/marketplace/${product.slug ?? product.id}`,
  });
}

export default async function MarketplaceProductDetailPage({ params }: { params: Promise<PageParams> }) {
  if (!isMarketplaceEnabled()) notFound();

  const { idDoTreino } = await params;
  const product = await loadDetail(idDoTreino);
  if (!product) notFound();

  const session = await getPublicSession();
  const athleteId = session?.user?.id ?? null;

  const existingLicense = athleteId
    ? await prisma.trainingLicense.findFirst({
        where: { productId: product.id, athleteId, status: { in: ["ACTIVE", "PAUSED", "COMPLETED"] } },
        select: { id: true },
      })
    : null;

  const buyerCallbackPath = buildMarketplaceCallbackUrl({
    productId: product.slug ?? product.id,
    versionId: product.versionId,
    intent: product.price ? MarketplaceCallbackIntent.PURCHASE : MarketplaceCallbackIntent.ACQUIRE_FREE,
  });
  const loginHref = `/entrar?callbackUrl=${encodeURIComponent(buyerCallbackPath)}`;

  const galleryImages = product.publicMedia.filter((m) => m.kind === "IMAGE");
  const galleryVideos = product.publicMedia.filter((m) => m.kind === "VIDEO");
  const primarySport = product.sportTypes.find(isRyvanoSportType);

  return (
    <AuroraBackground className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <AppHeader
          tagline="Treinos, saúde e alertas do seu relógio, direto no seu WhatsApp."
          navLinks={[]}
          action={<ThemeToggle />}
        />

        <nav aria-label="Breadcrumb" className="text-sm text-foreground/55">
          <Link href="/marketplace" className="hover:text-foreground">Marketplace</Link>
          {primarySport ? <> {"›"} <span>{getRyvanoSportLabel(primarySport)}</span></> : null}
          {" › "}<span className="text-foreground/80">{product.title}</span>
        </nav>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <header className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {primarySport ? (
                  <span className="theme-pill-info rounded-full border px-2.5 py-1 text-[11px] font-medium">{getRyvanoSportLabel(primarySport)}</span>
                ) : null}
                {product.difficulty ? (
                  <span className="theme-pill-neutral rounded-full border px-2.5 py-1 text-[11px] font-medium">{product.difficulty}</span>
                ) : null}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{product.title}</h1>
              {product.author ? (
                <p className="text-sm text-foreground/62">
                  por <span className="font-medium text-foreground/85">{product.author.name}</span>
                </p>
              ) : null}
              <div className="flex items-center gap-1.5 text-sm text-foreground/70">
                {product.reviewCount > 0 && product.ratingAverage !== null ? (
                  <>
                    <IconStar size={16} className="text-amber-300" aria-hidden />
                    <span>{product.ratingAverage.toFixed(1)}</span>
                    <span className="text-foreground/45">· {product.reviewCount} avaliações</span>
                  </>
                ) : (
                  <span className="theme-pill-neutral rounded-full border px-2.5 py-1 text-[11px] font-medium">Novo — ainda sem avaliações</span>
                )}
              </div>
            </header>

            {galleryImages.length > 0 || galleryVideos.length > 0 ? (
              <div className="space-y-3">
                {galleryImages[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- see MarketplaceProductCard's cover image note: storageKey has no resolved CDN/signed-URL pipeline yet.
                  <img
                    src={galleryImages[0].storageKey}
                    alt={galleryImages[0].altText}
                    className="aspect-video w-full rounded-[20px] object-cover"
                  />
                ) : null}
                {galleryVideos[0] ? (
                  <video
                    controls
                    preload="none"
                    poster={galleryVideos[0].thumbnailKey ?? undefined}
                    className="aspect-video w-full rounded-[20px] bg-black"
                  >
                    <source src={galleryVideos[0].storageKey} />
                  </video>
                ) : null}
                {galleryImages.length > 1 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {galleryImages.slice(1, 5).map((img) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={img.id} src={img.storageKey} alt={img.altText} className="aspect-square rounded-xl object-cover" />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {product.description ? (
              <section aria-labelledby="descricao-heading" className="glass space-y-2 rounded-[20px] border border-white/10 p-5">
                <h2 id="descricao-heading" className="text-base font-semibold text-foreground">Sobre este treino</h2>
                <p className="whitespace-pre-line text-sm leading-7 text-foreground/72">{product.description}</p>
              </section>
            ) : null}

            <section aria-labelledby="estrutura-heading" className="glass space-y-3 rounded-[20px] border border-white/10 p-5">
              <h2 id="estrutura-heading" className="text-base font-semibold text-foreground">Estrutura</h2>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                {product.durationWeeks ? (
                  <div><dt className="text-foreground/50">Duração</dt><dd className="text-foreground/85">{product.durationWeeks} semanas</dd></div>
                ) : null}
                {product.sessionsPerWeek ? (
                  <div><dt className="text-foreground/50">Sessões/semana</dt><dd className="text-foreground/85">{product.sessionsPerWeek}</dd></div>
                ) : null}
                {product.sessionDurationMinMax ? (
                  <div>
                    <dt className="text-foreground/50">Tempo por sessão</dt>
                    <dd className="text-foreground/85">
                      {product.sessionDurationMinMax.min ?? "?"}–{product.sessionDurationMinMax.max ?? "?"} min
                    </dd>
                  </div>
                ) : null}
                {product.equipment ? (
                  <div><dt className="text-foreground/50">Equipamento</dt><dd className="text-foreground/85">{product.equipment}</dd></div>
                ) : null}
              </dl>
            </section>

            {product.previewWeeks.length > 0 ? (
              <section aria-labelledby="amostra-heading" className="glass space-y-3 rounded-[20px] border border-white/10 p-5">
                <h2 id="amostra-heading" className="text-base font-semibold text-foreground">Amostra — semana {product.previewWeeks[0]?.week}</h2>
                <p className="text-xs text-foreground/50">
                  Esta é uma amostra pública. O plano completo é liberado ao adquirir.
                </p>
                <ul className="space-y-2">
                  {product.previewWeeks[0]?.days.map((day) => (
                    <li key={day.dayOfWeek} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                      <p className="font-medium text-foreground/85">Dia {day.dayOfWeek}</p>
                      <ul className="mt-1 space-y-1 text-foreground/68">
                        {day.sessions.map((session, i) => (
                          <li key={session.planSessionId ?? i}>
                            {session.workoutTemplate?.title ?? "Sessão"}
                            {session.sportType && isRyvanoSportType(session.sportType) ? ` · ${getRyvanoSportLabel(session.sportType)}` : ""}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {product.author?.bio ? (
              <section aria-labelledby="professor-heading" className="glass space-y-2 rounded-[20px] border border-white/10 p-5">
                <h2 id="professor-heading" className="text-base font-semibold text-foreground">Sobre o professor</h2>
                <p className="text-sm leading-7 text-foreground/72">{product.author.bio}</p>
              </section>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="glass space-y-4 rounded-[20px] border border-white/10 p-5">
              <p className="text-2xl font-semibold text-foreground">{formatPrice(product.price)}</p>

              {existingLicense ? (
                <Link href="/app/planos" className="glass-button-primary block w-full rounded-2xl px-5 py-3.5 text-center text-sm font-semibold">
                  Abrir meu plano
                </Link>
              ) : athleteId ? (
                <PurchaseCta productId={product.id} isFree={!product.price} />
              ) : (
                <Link href={loginHref} className="glass-button-primary block w-full rounded-2xl px-5 py-3.5 text-center text-sm font-semibold">
                  {product.price ? "Comprar plano" : "Adquirir grátis"}
                </Link>
              )}

              {!product.coachingIncluded ? (
                <p className="text-xs leading-5 text-foreground/55">
                  Acompanhamento com professor é opcional e separado — comprar este plano não contrata acompanhamento.
                </p>
              ) : (
                <p className="text-xs leading-5 text-foreground/55">Este plano inclui acompanhamento declarado pelo professor.</p>
              )}

              {product.offerTerms.policyVersion ? (
                <p className="text-[11px] text-foreground/40">Política de uso: versão {product.offerTerms.policyVersion}</p>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </AuroraBackground>
  );
}
