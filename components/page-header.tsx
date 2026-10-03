import type { ReactNode } from "react";

/**
 * The page heading of every screen inside the Ryvano shell: title, one line
 * of context and the page's primary actions on the right. Navigation back is
 * the shell's job (sidebar and breadcrumbs), so a page never draws its own
 * "← Voltar". Pair it with `StatTiles`, `SectionCard` and `EmptyState`, and
 * wrap the page in `PAGE_CLASS`.
 */
export const PAGE_CLASS = "space-y-6 p-6 md:p-10";

/** Primary call to action of a page (gradient pill, light and dark variants in globals.css). */
export const PRIMARY_ACTION_CLASS = "glass-button-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-55";
/** Secondary action (glass pill). */
export const SECONDARY_ACTION_CLASS = "glass-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground disabled:opacity-55";
/** One row/card inside a `SectionCard` (remapped for the light theme in globals.css). */
export const ITEM_CLASS = "rounded-[20px] border border-white/10 bg-white/5 p-4";
/** Text field / select inside a page (glass surface, both themes). */
export const FIELD_CLASS = "glass-input w-full rounded-[16px] px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-foreground/42";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? <div className="mt-1 text-sm text-foreground/60">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
