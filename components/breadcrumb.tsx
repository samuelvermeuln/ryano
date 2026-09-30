import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

/**
 * Trilha de contexto para telas aninhadas (ex.: "Meus produtos › Novo produto").
 * O primeiro item com `href` faz o papel de "Voltar" — o caminho de retorno é
 * o da hierarquia real da tela, não o histórico do navegador.
 */
export function Breadcrumb({ items, className = "" }: { items: readonly BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Trilha de navegação" className={`flex flex-wrap items-center gap-1.5 text-sm text-foreground/60 ${className}`}>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
          {index > 0 ? <span aria-hidden="true">›</span> : null}
          {item.href ? (
            <Link href={item.href} className="rounded-full px-1 text-foreground/70 transition hover:text-foreground">
              {index === 0 ? `← ${item.label}` : item.label}
            </Link>
          ) : (
            <span aria-current="page" className="font-semibold text-foreground/85">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
