/**
 * TM035 — skeleton preserves the exact card grid geometry (aspect-ratio
 * cover + fixed padding/heights) so the layout does not jump once real
 * results replace it (spec §5.1/§6, RNF-010 motion).
 */
export default function MarketplaceLoading() {
  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8" aria-busy="true" aria-live="polite">
        <div className="glass h-16 animate-pulse rounded-[24px] border border-white/10" />
        <div className="glass h-40 animate-pulse rounded-[24px] border border-white/10" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="glass hidden h-[520px] w-[280px] shrink-0 animate-pulse rounded-[20px] border border-white/10 lg:block" />
          <div className="grid flex-1 grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass overflow-hidden rounded-[20px] border border-white/10">
                <div className="aspect-[16/9] w-full animate-pulse bg-white/5" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
