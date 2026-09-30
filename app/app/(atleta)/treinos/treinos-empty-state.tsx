import Link from "next/link";

/** Local empty state for /app/treinos — kept separate from the generic
 *  components/empty-state.tsx because every view here wants an emoji and an
 *  optional "back to current period" CTA, which the generic component
 *  doesn't support. */
export function TreinosEmptyState({
  emoji = "📆",
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  emoji?: string;
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="py-20 text-center space-y-3">
      <p className="text-5xl">{emoji}</p>
      <p className="text-sm text-foreground/50">{title}</p>
      <p className="text-xs text-foreground/35">{description}</p>
      {ctaHref && ctaLabel && (
        <Link href={ctaHref} className="inline-block text-xs text-primary underline underline-offset-2">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
