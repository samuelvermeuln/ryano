"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconAdjustmentsHorizontal, IconX } from "@tabler/icons-react";
import { RYVANO_SPORT_TYPES, getRyvanoSportLabel, isRyvanoSportType, type RyvanoSportType } from "@/modules/shared/activities/sport-types";

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevância" },
  { value: "recent", label: "Mais recentes" },
  { value: "most-purchased", label: "Mais comprados" },
  { value: "best-rated", label: "Mais bem avaliados" },
  { value: "price-asc", label: "Menor preço" },
  { value: "price-desc", label: "Maior preço" },
] as const;

const DIFFICULTY_OPTIONS = [
  { value: "beginner", label: "Iniciante" },
  { value: "intermediate", label: "Intermediário" },
  { value: "advanced", label: "Avançado" },
] as const;

const RATING_OPTIONS = [4, 4.5] as const;

const FILTER_KEYS = [
  "q", "sportType", "difficulty", "goal", "eventType", "eventDistance",
  "weeksMin", "weeksMax", "sessionsPerWeek", "minRating", "priceMin",
  "priceMax", "free", "equipment", "language",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

/** Human-readable chip label for one active filter — used by the removable-chips row (spec §5.1). */
function chipLabel(key: FilterKey, value: string): string {
  switch (key) {
    case "sportType":
      return value.split(",").filter(isRyvanoSportType).map(getRyvanoSportLabel).join(", ");
    case "q":
      return `"${value}"`;
    case "difficulty":
      return DIFFICULTY_OPTIONS.find((d) => d.value === value)?.label ?? value;
    case "free":
      return value === "true" ? "Gratuito" : "Pago";
    case "minRating":
      return `A partir de ${value}★`;
    case "weeksMin":
      return `A partir de ${value} semanas`;
    case "weeksMax":
      return `Até ${value} semanas`;
    case "priceMin":
      return `Preço a partir de R$ ${(Number(value) / 100).toFixed(0)}`;
    case "priceMax":
      return `Preço até R$ ${(Number(value) / 100).toFixed(0)}`;
    default:
      return value;
  }
}

/**
 * TM035 (RF-105/spec §5.1) — filters sidebar (desktop, sticky) / drawer
 * (mobile). The query string is the single source of truth: every control
 * reads its current value from `useSearchParams` and writes back through
 * `router.push`, so filters, sort and page survive a reload and are
 * shareable as a link — nothing is held in a separate client store.
 */
export function MarketplaceFilters({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [qDraft, setQDraft] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => setQDraft(searchParams.get("q") ?? ""), [searchParams]);

  useEffect(() => {
    if (!drawerOpen) return;
    drawerHeadingRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const activeFilters = useMemo(
    () => FILTER_KEYS
      .map((key) => [key, searchParams.get(key)] as const)
      .filter((entry): entry is [FilterKey, string] => Boolean(entry[1])),
    [searchParams],
  );

  const setParam = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    next.delete("cursor"); // any filter/sort change restarts pagination
    router.push(`${pathname}?${next.toString()}`);
  }, [pathname, router, searchParams]);

  const toggleSportType = useCallback((sport: RyvanoSportType) => {
    const current = (searchParams.get("sportType") ?? "").split(",").filter(Boolean);
    const next = current.includes(sport) ? current.filter((s) => s !== sport) : [...current, sport];
    setParam("sportType", next.length ? next.join(",") : null);
  }, [searchParams, setParam]);

  const clearAll = useCallback(() => {
    router.push(pathname);
  }, [pathname, router]);

  function onSearchChange(value: string) {
    setQDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParam("q", value || null), 350);
  }

  const selectedSports = (searchParams.get("sportType") ?? "").split(",").filter(isRyvanoSportType);

  const fields = (
    <div className="space-y-6">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-foreground/55">Buscar</span>
        <input
          type="search"
          value={qDraft}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Nome do treino, modalidade, prova…"
          className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-foreground/40"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-foreground/55">Modalidade</legend>
        <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 thin-scrollbar">
          {RYVANO_SPORT_TYPES.filter((s) => s !== "default").map((sport) => (
            <label key={sport} className="flex min-h-[28px] items-center gap-2 text-sm text-foreground/76">
              <input
                type="checkbox"
                checked={selectedSports.includes(sport)}
                onChange={() => toggleSportType(sport)}
                className="h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              {getRyvanoSportLabel(sport)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-foreground/55">Duração (semanas)</legend>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="weeksMin">Semanas — mínimo</label>
          <input
            id="weeksMin" type="number" min={1} max={520} placeholder="Mín."
            defaultValue={searchParams.get("weeksMin") ?? ""}
            onBlur={(e) => setParam("weeksMin", e.target.value || null)}
            className="glass-input w-full rounded-xl px-3 py-2 text-sm outline-none"
          />
          <span className="text-foreground/40">–</span>
          <label className="sr-only" htmlFor="weeksMax">Semanas — máximo</label>
          <input
            id="weeksMax" type="number" min={1} max={520} placeholder="Máx."
            defaultValue={searchParams.get("weeksMax") ?? ""}
            onBlur={(e) => setParam("weeksMax", e.target.value || null)}
            className="glass-input w-full rounded-xl px-3 py-2 text-sm outline-none"
          />
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-foreground/55">Dificuldade</legend>
        <div className="flex flex-wrap gap-2">
          {DIFFICULTY_OPTIONS.map((opt) => {
            const active = searchParams.get("difficulty") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => setParam("difficulty", active ? null : opt.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? "theme-pill-info" : "border-white/10 bg-white/5 text-foreground/68 hover:bg-white/10"}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-foreground/55">Avaliação</legend>
        <div className="flex flex-wrap gap-2">
          {RATING_OPTIONS.map((rating) => {
            const active = searchParams.get("minRating") === String(rating);
            return (
              <button
                key={rating}
                type="button"
                aria-pressed={active}
                onClick={() => setParam("minRating", active ? null : String(rating))}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? "theme-pill-info" : "border-white/10 bg-white/5 text-foreground/68 hover:bg-white/10"}`}
              >
                A partir de {rating}★
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-foreground/55">Preço</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={searchParams.get("free") === "true"}
            onClick={() => setParam("free", searchParams.get("free") === "true" ? null : "true")}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${searchParams.get("free") === "true" ? "theme-pill-success" : "border-white/10 bg-white/5 text-foreground/68 hover:bg-white/10"}`}
          >
            Gratuito
          </button>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <label className="sr-only" htmlFor="priceMin">Preço mínimo (R$)</label>
          <input
            id="priceMin" type="number" min={0} placeholder="Mín. R$"
            defaultValue={searchParams.get("priceMin") ? String(Number(searchParams.get("priceMin")) / 100) : ""}
            onBlur={(e) => setParam("priceMin", e.target.value ? String(Math.round(Number(e.target.value) * 100)) : null)}
            className="glass-input w-full rounded-xl px-3 py-2 text-sm outline-none"
          />
          <span className="text-foreground/40">–</span>
          <label className="sr-only" htmlFor="priceMax">Preço máximo (R$)</label>
          <input
            id="priceMax" type="number" min={0} placeholder="Máx. R$"
            defaultValue={searchParams.get("priceMax") ? String(Number(searchParams.get("priceMax")) / 100) : ""}
            onBlur={(e) => setParam("priceMax", e.target.value ? String(Math.round(Number(e.target.value) * 100)) : null)}
            className="glass-input w-full rounded-xl px-3 py-2 text-sm outline-none"
          />
        </div>
        <p className="text-[11px] text-foreground/45">Comprar um plano não inclui acompanhamento com professor por padrão.</p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-foreground/55">Equipamento e idioma</legend>
        <label className="sr-only" htmlFor="equipment">Equipamento</label>
        <input
          id="equipment" type="text" placeholder="Ex.: tênis, esteira…"
          defaultValue={searchParams.get("equipment") ?? ""}
          onBlur={(e) => setParam("equipment", e.target.value || null)}
          className="glass-input w-full rounded-xl px-3 py-2 text-sm outline-none"
        />
        <label className="sr-only" htmlFor="language">Idioma</label>
        <input
          id="language" type="text" placeholder="Ex.: pt"
          defaultValue={searchParams.get("language") ?? ""}
          onBlur={(e) => setParam("language", e.target.value || null)}
          className="glass-input w-full rounded-xl px-3 py-2 text-sm outline-none"
        />
      </fieldset>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="glass hidden w-[280px] shrink-0 self-start rounded-[20px] border border-white/10 p-5 lg:sticky lg:top-20 lg:block">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Filtros</h2>
          {activeFilters.length > 0 ? (
            <button type="button" onClick={clearAll} className="text-xs font-medium text-accent hover:underline">
              Limpar tudo
            </button>
          ) : null}
        </div>
        {fields}
      </aside>

      {/* Mobile trigger + result count + sort */}
      <div className="flex flex-wrap items-center justify-between gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="glass-button inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium"
        >
          <IconAdjustmentsHorizontal size={18} aria-hidden />
          Filtros{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
        </button>
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtros ativos">
          {activeFilters.map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => setParam(key, null)}
              className="theme-pill-neutral inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
            >
              {chipLabel(key, value)}
              <IconX size={13} aria-hidden />
              <span className="sr-only">Remover filtro</span>
            </button>
          ))}
          <button type="button" onClick={clearAll} className="text-xs font-medium text-accent hover:underline">
            Limpar tudo
          </button>
        </div>
      ) : null}

      {/* Result count + sort — shared row above the grid */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground/60" aria-live="polite">
          {resultCount === 0 ? "Nenhum resultado" : `${resultCount} ${resultCount === 1 ? "resultado" : "resultados"}`}
        </p>
        <label className="flex items-center gap-2 text-sm text-foreground/70">
          Ordenar por
          <select
            value={searchParams.get("sort") ?? ""}
            onChange={(e) => setParam("sort", e.target.value || null)}
            className="glass-input rounded-xl px-3 py-2 text-sm outline-none"
          >
            <option value="">Padrão</option>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end lg:hidden" role="presentation">
          <button
            type="button"
            aria-label="Fechar filtros"
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="marketplace-filters-drawer-heading"
            className="glass-strong relative flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto border-l border-white/10 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 id="marketplace-filters-drawer-heading" ref={drawerHeadingRef} tabIndex={-1} className="text-base font-semibold text-foreground outline-none">
                Filtros
              </h2>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Fechar" className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5">
                <IconX size={18} aria-hidden />
              </button>
            </div>
            {fields}
            <div className="sticky bottom-0 mt-auto flex gap-3 border-t border-white/10 bg-[var(--card-bg,transparent)] pt-4">
              <button type="button" onClick={clearAll} className="glass-button flex-1 rounded-2xl px-4 py-3 text-sm font-medium">
                Limpar tudo
              </button>
              <button type="button" onClick={() => setDrawerOpen(false)} className="glass-button-primary flex-1 rounded-2xl px-4 py-3 text-sm font-semibold">
                Aplicar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
