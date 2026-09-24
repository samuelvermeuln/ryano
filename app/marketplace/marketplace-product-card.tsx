import Link from "next/link";
import { IconStar, IconUsers } from "@tabler/icons-react";
import type { MarketplaceProductSummary } from "@/modules/school/application/list-marketplace-products";
import { getRyvanoSportLabel, isRyvanoSportType } from "@/modules/shared/activities/sport-types";

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: "Iniciante",
  intermediate: "Intermediário",
  advanced: "Avançado",
};

function formatPrice(price: MarketplaceProductSummary["price"]) {
  if (!price) return "Grátis";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: price.currency }).format(price.amountCents / 100);
}

/**
 * TM035 — one catalog card. Presentational only: the whole card opens the
 * detail page through a single "Ver treino" link (spec §5, "controles
 * internos acessíveis separadamente, sem link aninhado" — there ARE no
 * inner interactive controls on this card, so a single wrapping link is the
 * simplest way to satisfy that rule without nested `<a>`/`<button>` tags).
 */
export function MarketplaceProductCard({ product }: { product: MarketplaceProductSummary }) {
  const href = `/marketplace/${product.slug ?? product.id}`;
  const primarySport = product.sportTypes.find(isRyvanoSportType);

  return (
    <Link
      href={href}
      className="glass group flex h-full flex-col overflow-hidden rounded-[20px] border border-white/10 transition hover:border-white/20 hover:shadow-[0_18px_40px_rgba(4,20,30,0.25)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-white/5">
        {product.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- storageKey has no resolved CDN/signed-URL pipeline yet (see coverImages() doc comment); a plain <img> keeps this honest instead of guessing a URL shape for next/image.
          <img
            src={product.coverImage.storageKey}
            alt={product.coverImage.altText}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-foreground/40" aria-hidden>
            Sem capa
          </div>
        )}
        {primarySport ? (
          <span className="theme-pill-info absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[11px] font-medium">
            {getRyvanoSportLabel(primarySport)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-base font-semibold text-foreground">{product.title}</h3>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/62">
          {product.durationWeeks ? <span>{product.durationWeeks} semanas</span> : null}
          {product.sessionsPerWeek ? <span>{product.sessionsPerWeek}x/semana</span> : null}
          {product.difficulty ? <span>{DIFFICULTY_LABEL[product.difficulty] ?? product.difficulty}</span> : null}
        </div>

        {product.author ? (
          <p className="truncate text-xs text-foreground/55">
            por <span className="text-foreground/76">{product.author.name}</span>
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 text-xs text-foreground/70">
            {product.reviewCount > 0 && product.ratingAverage !== null ? (
              <>
                <IconStar size={15} className="text-amber-300" aria-hidden />
                <span>{product.ratingAverage.toFixed(1)}</span>
                <span className="text-foreground/45">· {product.reviewCount} avaliações</span>
              </>
            ) : (
              <span className="theme-pill-neutral rounded-full border px-2 py-0.5 text-[11px] font-medium">Novo</span>
            )}
          </div>
          <span className="text-sm font-semibold text-foreground">{formatPrice(product.price)}</span>
        </div>

        {product.coachingIncluded ? (
          <span className="theme-pill-success inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium">
            <IconUsers size={12} aria-hidden /> Acompanhamento incluído
          </span>
        ) : null}
      </div>
    </Link>
  );
}
