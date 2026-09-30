"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconSwitchHorizontal } from "@tabler/icons-react";

import { switchContextAction } from "@/app/actions/user-context";
import type { UserContextSummary } from "@/lib/user-context";

type ContextSwitcherProps = {
  active: UserContextSummary;
  available: readonly UserContextSummary[];
  /** Escopo dentro do contexto (ex.: nome da escola no painel do professor). */
  scopeLabel?: string | null;
};

/**
 * SAM-14 — identifica o contexto ativo no header e permite trocar para outro
 * contexto autorizado. A troca é uma Server Action que valida a chave contra
 * os contextos reais do usuário antes de gravar o cookie e redirecionar.
 *
 * Com um único contexto vira um rótulo estático: não há o que trocar, e um
 * seletor com uma opção só confundiria.
 */
export function ContextSwitcher({ active, available, scopeLabel }: ContextSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const others = available.filter((context) => context.key !== active.key);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const description = scopeLabel && scopeLabel !== active.label ? `${active.label} · ${scopeLabel}` : active.label;

  if (others.length === 0) {
    return (
      <span
        data-testid="active-context"
        data-context-key={active.key}
        className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs font-semibold text-foreground/80 sm:inline-flex"
      >
        <span className="text-foreground/55">{active.kind}</span>
        <span className="max-w-[12rem] truncate">{description}</span>
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Contexto atual: ${active.kind} ${description}. Trocar contexto`}
        data-testid="active-context"
        data-context-key={active.key}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs font-semibold text-foreground/85 transition hover:bg-white/10 hover:text-foreground"
      >
        <IconSwitchHorizontal size={14} aria-hidden="true" />
        <span className="text-foreground/55">{active.kind}</span>
        <span className="hidden max-w-[12rem] truncate sm:inline">{description}</span>
        <IconChevronDown size={14} className={`transition ${open ? "rotate-180" : "rotate-0"}`} aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Trocar contexto"
          className="glass-strong absolute right-0 top-[calc(100%+0.75rem)] z-40 w-64 rounded-[20px] p-2"
        >
          <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
            Trocar contexto
          </p>
          <form action={switchContextAction} className="grid gap-1">
            {others.map((context) => (
              // Sem `onClick={() => setOpen(false)}`: fechar o menu desmontaria o
              // <form> antes do submit; a Server Action redireciona e o menu some junto.
              <button
                key={context.key}
                type="submit"
                name="contextKey"
                value={context.key}
                role="menuitem"
                className="flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-3 text-left text-sm text-foreground/80 transition hover:bg-white/8 hover:text-foreground"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{context.label}</span>
                  <span className="block text-xs text-foreground/55">{context.kind}</span>
                </span>
              </button>
            ))}
          </form>
        </div>
      ) : null}
    </div>
  );
}
