"use client";

import { Icon } from "@iconify/react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  IconActivity,
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconArrowRight,
  IconBarbell,
  IconBike,
  IconCalendarCheck,
  IconChevronRight,
  IconClock,
  IconLoader2,
  IconRoute,
  IconRun,
  IconSearch,
  IconSwimming,
  IconTrophy,
  IconWalk,
} from "@tabler/icons-react";

import { UserAvatar } from "@/components/user-avatar";
import { getProviderVisual } from "@/modules/shared/integrations/catalog/visual";

export type ActivitiesBrowserProps = {
  header: {
    eyebrow: string;
    title: string;
    description: string;
    resultLabel: string | null;
    userName?: string;
    userImage?: string | null;
  };
  filters: {
    days: number;
    provider: string;
    sportType: string;
    query: string;
    sort: string;
  };
  options: {
    periods: Array<{
      value: number;
      shortLabel: string;
      fullLabel: string;
    }>;
    providers: Array<{
      value: string;
      label: string;
    }>;
    sports: Array<{
      value: string;
      label: string;
    }>;
    sorts: Array<{
      value: string;
      label: string;
    }>;
  };
  summaryCards: Array<{
    key: string;
    icon: "activity" | "route" | "clock" | "calendar";
    value: string;
    label: string;
    subtitle: string;
    comparison: string | null;
  }>;
  groups: Array<{
    label: string;
    items: Array<{
      id: string;
      href: string;
      title: string;
      meta: string;
      origin: {
        label: string;
        providerId: string;
      };
      sportTone: "swim" | "bike" | "run" | "triathlon" | "walking" | "strength" | "default";
      metrics: Array<{
        label: string;
        value: string;
      }>;
      badges: Array<{
        label: string;
        tone: "neutral" | "info" | "warning" | "success";
        icon: "trophy" | "warning" | "recent";
      }>;
      facts: string[];
    }>;
  }>;
  pagination: {
    page: number;
    totalPages: number;
    totalItems: number;
    pageStart: number;
    pageEnd: number;
  };
  emptyState: {
    kind: "filters" | "account";
    title: string;
    description: string;
    actionLabel: string;
    actionHref?: string;
  } | null;
};

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  show: {
    opacity: 1,
    y: 0,
  },
};

export function ActivitiesBrowser({
  header,
  filters,
  options,
  summaryCards,
  groups,
  pagination,
  emptyState,
}: ActivitiesBrowserProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const [isPending, startTransition] = useTransition();
  const [queryDraft, setQueryDraft] = useState({
    base: filters.query,
    value: filters.query,
  });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryValue = queryDraft.base === filters.query ? queryDraft.value : filters.query;

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (!value) {
        next.delete(key);
        continue;
      }

      next.set(key, value);
    }

    if (next.get("days") === "30") {
      next.delete("days");
    }

    if (next.get("sort") === "recent") {
      next.delete("sort");
    }

    if (next.get("page") === "1") {
      next.delete("page");
    }

    const href = next.toString() ? `${pathname}?${next.toString()}` : pathname;

    startTransition(() => {
      router.replace(href);
    });
  }, [pathname, router, searchParams, startTransition]);

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];

    if (filters.days !== 30) {
      chips.push({
        key: "days",
        label: options.periods.find((item) => item.value === filters.days)?.fullLabel ?? `${filters.days} dias`,
        clear: () => updateParams({ days: null, page: null }),
      });
    }

    if (filters.sportType) {
      chips.push({
        key: "sportType",
        label: options.sports.find((item) => item.value === filters.sportType)?.label ?? filters.sportType,
        clear: () => updateParams({ sportType: null, page: null }),
      });
    }

    if (filters.provider) {
      chips.push({
        key: "provider",
        label: options.providers.find((item) => item.value === filters.provider)?.label ?? filters.provider,
        clear: () => updateParams({ provider: null, page: null }),
      });
    }

    if (filters.sort !== "recent") {
      chips.push({
        key: "sort",
        label: options.sorts.find((item) => item.value === filters.sort)?.label ?? filters.sort,
        clear: () => updateParams({ sort: null, page: null }),
      });
    }

    if (filters.query) {
      chips.push({
        key: "query",
        label: `Busca: ${filters.query}`,
        clear: () => updateParams({ q: null, page: null }),
      });
    }

    return chips;
  }, [filters.days, filters.provider, filters.query, filters.sort, filters.sportType, options.periods, options.providers, options.sorts, options.sports, updateParams]);

  useEffect(() => {
    const normalizedQuery = queryValue.trim();

    if (normalizedQuery === filters.query) {
      return;
    }

    const timeout = window.setTimeout(() => {
      updateParams({ q: normalizedQuery || null, page: null });
    }, 260);

    return () => window.clearTimeout(timeout);
  }, [filters.query, queryValue, updateParams]);

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={reducedMotion ? undefined : containerVariants}
      className="space-y-5"
    >
      <motion.section
        variants={reducedMotion ? undefined : itemVariants}
        transition={{ duration: 0.35 }}
        className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] sm:p-6"
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-4">
            <UserAvatar name={header.userName ?? header.title} image={header.userImage} size="lg" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-foreground/42">{header.eyebrow}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-[2.2rem]">{header.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-foreground/66">{header.description}</p>
            </div>
          </div>

          {header.resultLabel ? (
            <div className="inline-flex items-center rounded-full border border-white/10 bg-black/10 px-4 py-2 text-sm font-medium text-foreground/72">
              {header.resultLabel}
            </div>
          ) : null}
        </div>
      </motion.section>

      <motion.section
        variants={reducedMotion ? undefined : itemVariants}
        transition={{ duration: 0.35 }}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        {summaryCards.map((card, index) => (
          <motion.div
            key={card.key}
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.05 }}
            className="relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.045] p-5"
          >
            <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.16),transparent_65%)] blur-2xl" />
            <div className="relative">
              <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 ${getSummaryCardAccentClass(card.key)}`}>
                {renderSummaryIcon(card.icon)}
              </div>
              <p className="text-[2rem] font-semibold tracking-tight text-foreground tabular-nums">{card.value}</p>
              <p className="mt-1 text-sm text-foreground/72">{card.label}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-foreground/42">{card.subtitle}</p>
              {card.comparison ? <p className="mt-3 text-sm text-foreground/62">{card.comparison}</p> : null}
            </div>
          </motion.div>
        ))}
      </motion.section>

      <motion.section
        variants={reducedMotion ? undefined : itemVariants}
        transition={{ duration: 0.35 }}
        className="rounded-[26px] border border-white/10 bg-white/[0.045] p-4 sm:p-5"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 overflow-x-auto">
            {options.periods.map((period) => {
              const active = filters.days === period.value;
              return (
                <button
                  key={period.value}
                  type="button"
                  onClick={() => updateParams({ days: String(period.value), page: null })}
                  className={`relative min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                    active ? "text-black" : "border border-white/10 bg-white/5 text-foreground hover:bg-white/8"
                  } ${isPending && active ? "opacity-70" : ""}`}
                >
                  {active ? (
                    <motion.span
                      layoutId={reducedMotion ? undefined : "activity-period-active"}
                      className="absolute inset-0 rounded-full bg-white"
                      transition={{ type: "spring", stiffness: 320, damping: 28 }}
                    />
                  ) : null}
                  <span className="relative z-10">{period.shortLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(260px,1.25fr)_minmax(0,1fr)]">
            <FilterField label="Modalidade">
              <select
                value={filters.sportType}
                onChange={(event) => updateParams({ sportType: event.target.value || null, page: null })}
                className="w-full bg-transparent text-sm text-foreground outline-none"
              >
                <option value="" className="bg-black text-white">Todas as modalidades</option>
                {options.sports.map((option) => (
                  <option key={option.value} value={option.value} className="bg-black text-white">
                    {option.label}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Origem">
              <select
                value={filters.provider}
                onChange={(event) => updateParams({ provider: event.target.value || null, page: null })}
                className="w-full bg-transparent text-sm text-foreground outline-none"
              >
                <option value="" className="bg-black text-white">Todas as origens</option>
                {options.providers.map((option) => (
                  <option key={option.value} value={option.value} className="bg-black text-white">
                    {option.label}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Buscar atividade">
              <div className="flex items-center gap-3">
                <IconSearch size={18} className="text-foreground/48" />
                <input
                  value={queryValue}
                  onChange={(event) =>
                    setQueryDraft({
                      base: filters.query,
                      value: event.target.value,
                    })
                  }
                  placeholder="Buscar atividade..."
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/42"
                />
              </div>
            </FilterField>

            <FilterField label="Ordenação">
              <div className="flex items-center gap-3">
                <IconAdjustmentsHorizontal size={18} className="text-foreground/48" />
                <select
                  value={filters.sort}
                  onChange={(event) => updateParams({ sort: event.target.value || null, page: null })}
                  className="w-full bg-transparent text-sm text-foreground outline-none"
                >
                  {options.sorts.map((option) => (
                    <option key={option.value} value={option.value} className="bg-black text-white">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </FilterField>
          </div>

          {isPending ? (
            <div className="inline-flex items-center gap-2 text-sm text-foreground/58">
              <IconLoader2 size={16} className="animate-spin" />
              Atualizando histórico...
            </div>
          ) : null}
        </div>
      </motion.section>

      {activeChips.length ? (
        <motion.section
          variants={reducedMotion ? undefined : itemVariants}
          transition={{ duration: 0.3 }}
          className="rounded-[24px] border border-white/10 bg-black/10 px-4 py-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-foreground/76 transition hover:bg-white/10"
              >
                <span>{chip.label}</span>
                <span className="text-foreground/48">×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setQueryDraft({
                  base: filters.query,
                  value: "",
                });
                startTransition(() => {
                  router.replace(pathname);
                });
              }}
              className="ml-auto min-h-10 rounded-full px-3 py-2 text-sm font-semibold text-foreground/72 transition hover:text-foreground"
            >
              Limpar filtros
            </button>
          </div>
        </motion.section>
      ) : null}

      {emptyState ? (
        <motion.section
          variants={reducedMotion ? undefined : itemVariants}
          transition={{ duration: 0.3 }}
          className="rounded-[26px] border border-white/10 bg-white/[0.045] p-6 sm:p-8"
        >
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/10 bg-black/10 text-foreground/82">
              {emptyState.kind === "account" ? <IconActivity size={28} /> : <IconSearch size={28} />}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">{emptyState.title}</h2>
            <p className="mt-3 text-sm leading-7 text-foreground/62">{emptyState.description}</p>
            {emptyState.actionHref ? (
              <Link href={emptyState.actionHref} className="glass-button mt-6 rounded-full px-5 py-3 text-sm font-semibold text-foreground">
                {emptyState.actionLabel}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setQueryDraft({
                    base: filters.query,
                    value: "",
                  });
                  startTransition(() => {
                    router.replace(pathname);
                  });
                }}
                className="glass-button mt-6 rounded-full px-5 py-3 text-sm font-semibold text-foreground"
              >
                {emptyState.actionLabel}
              </button>
            )}
          </div>
        </motion.section>
      ) : (
        <motion.div
          key={`${filters.days}-${filters.provider}-${filters.sportType}-${filters.sort}-${filters.query}-${pagination.page}`}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          className={isPending ? "opacity-70" : ""}
        >
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.label} className="space-y-3">
                <div className="flex items-center gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-foreground/44">{group.label}</p>
                  <div className="h-px flex-1 bg-white/8" />
                </div>

                <div className="grid gap-3">
                  {group.items.map((activity, index) => (
                    <Link key={activity.id} href={activity.href} className="group block">
                      <motion.article
                        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                        animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, delay: reducedMotion ? 0 : Math.min(index, 6) * 0.04 }}
                        whileHover={reducedMotion ? undefined : { y: -2 }}
                        className={`relative overflow-hidden rounded-[26px] border bg-white/[0.045] transition group-hover:bg-white/[0.075] ${getSportCardClass(activity.sportTone)}`}
                      >
                        <div className={`absolute inset-y-5 left-0 w-px bg-gradient-to-b ${getSportLineClass(activity.sportTone)}`} />
                        <div className={`absolute right-0 top-0 h-28 w-28 rounded-full blur-3xl ${getSportGlowClass(activity.sportTone)}`} />

                        <div className="relative flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6 xl:flex-row xl:items-start xl:justify-between">
                          <div className="flex gap-4">
                            <div className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[20px] border border-white/10 text-[1.15rem] ${getSportIconShellClass(activity.sportTone)}`}>
                              {renderSportIcon(activity.sportTone)}
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-start gap-2">
                                <h3 className="text-base font-semibold text-foreground sm:text-[1.05rem]">{activity.title}</h3>
                                {activity.badges.map((badge) => (
                                  <Badge key={badge.label} label={badge.label} tone={badge.tone} icon={badge.icon} compact />
                                ))}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <p className="text-sm text-foreground/58">{activity.meta}</p>
                                {(() => {
                                  const providerVisual = getProviderVisual(activity.origin.providerId);
                                  return (
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] ${providerVisual.textClassName} ${providerVisual.backgroundClassName} ${providerVisual.borderClassName}`}
                                    >
                                      <Icon icon={providerVisual.icon} width={13} height={13} />
                                      <span>{activity.origin.label}</span>
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[420px] xl:max-w-[520px] xl:flex-1">
                            {activity.metrics.map((metric) => (
                              <div key={metric.label} className="rounded-[18px] border border-white/8 bg-black/10 px-3 py-3 sm:px-4">
                                <p className="text-base font-semibold tracking-tight text-foreground tabular-nums sm:text-lg">{metric.value}</p>
                                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-foreground/44 sm:text-[11px]">{metric.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="relative flex flex-col gap-3 border-t border-white/8 px-5 py-4 sm:px-6 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap gap-2">
                            {activity.facts.map((fact) => (
                              <span key={fact} className="theme-pill-neutral inline-flex items-center rounded-full border px-3 py-2 text-xs font-semibold tracking-[0.12em]">
                                {fact}
                              </span>
                            ))}
                          </div>

                          <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                            <span>Ver análise</span>
                            <IconArrowRight size={16} className="transition group-hover:translate-x-1" />
                          </div>
                        </div>
                      </motion.article>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </motion.div>
      )}

      {pagination.totalPages > 1 ? (
        <motion.section
          variants={reducedMotion ? undefined : itemVariants}
          transition={{ duration: 0.3 }}
          className="rounded-[24px] border border-white/10 bg-white/[0.045] px-4 py-4 sm:px-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground/64">
              Mostrando {pagination.pageStart}–{pagination.pageEnd} de {pagination.totalItems} atividades
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => updateParams({ page: String(pagination.page - 1) })}
                className="glass-button rounded-full px-4 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => updateParams({ page: String(pagination.page + 1) })}
                className="glass-button rounded-full px-4 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </motion.section>
      ) : null}
    </motion.div>
  );

  function renderSummaryIcon(icon: ActivitiesBrowserProps["summaryCards"][number]["icon"]) {
    switch (icon) {
      case "activity":
        return <IconActivity size={20} />;
      case "route":
        return <IconRoute size={20} />;
      case "clock":
        return <IconClock size={20} />;
      case "calendar":
        return <IconCalendarCheck size={20} />;
      default:
        return <IconChevronRight size={20} />;
    }
  }
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/74">{label}</span>
      <div className="glass-input rounded-[20px] px-4 py-3.5">{children}</div>
    </label>
  );
}

function Badge({
  label,
  tone,
  icon,
  compact = false,
}: {
  label: string;
  tone: "neutral" | "info" | "warning" | "success";
  icon: "trophy" | "warning" | "recent";
  compact?: boolean;
}) {
  const toneClass =
    tone === "success"
      ? "theme-pill-success"
      : tone === "warning"
        ? "theme-pill-warning"
        : tone === "info"
          ? "theme-pill-info"
          : "theme-pill-neutral";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold tracking-[0.12em] ${toneClass} ${compact ? "mt-0.5" : ""}`}
    >
      {icon === "trophy" ? <IconTrophy size={14} /> : icon === "warning" ? <IconAlertTriangle size={14} /> : <IconChevronRight size={14} />}
      <span>{label}</span>
    </span>
  );
}

function renderSportIcon(sportTone: ActivitiesBrowserProps["groups"][number]["items"][number]["sportTone"]) {
  switch (sportTone) {
    case "swim":
      return <IconSwimming size={24} />;
    case "bike":
      return <IconBike size={24} />;
    case "run":
      return <IconRun size={24} />;
    case "walking":
      return <IconWalk size={24} />;
    case "strength":
      return <IconBarbell size={24} />;
    case "triathlon":
      return <IconTrophy size={24} />;
    default:
      return <IconActivity size={24} />;
  }
}

function getSportCardClass(sportTone: ActivitiesBrowserProps["groups"][number]["items"][number]["sportTone"]) {
  switch (sportTone) {
    case "swim":
      return "border-cyan-400/18";
    case "bike":
      return "border-emerald-400/16";
    case "run":
      return "border-orange-400/18";
    case "walking":
      return "border-teal-400/18";
    case "strength":
      return "border-amber-400/18";
    case "triathlon":
      return "border-violet-400/18";
    default:
      return "border-white/10";
  }
}

function getSportLineClass(sportTone: ActivitiesBrowserProps["groups"][number]["items"][number]["sportTone"]) {
  switch (sportTone) {
    case "swim":
      return "from-cyan-300/0 via-cyan-300/90 to-sky-300/0";
    case "bike":
      return "from-emerald-300/0 via-emerald-300/90 to-lime-300/0";
    case "run":
      return "from-orange-300/0 via-orange-300/90 to-rose-300/0";
    case "walking":
      return "from-teal-300/0 via-teal-300/90 to-cyan-300/0";
    case "strength":
      return "from-amber-300/0 via-amber-300/90 to-yellow-300/0";
    case "triathlon":
      return "from-violet-300/0 via-violet-300/90 to-fuchsia-300/0";
    default:
      return "from-white/0 via-white/60 to-white/0";
  }
}

function getSportGlowClass(sportTone: ActivitiesBrowserProps["groups"][number]["items"][number]["sportTone"]) {
  switch (sportTone) {
    case "swim":
      return "bg-cyan-400/14";
    case "bike":
      return "bg-emerald-400/14";
    case "run":
      return "bg-orange-400/14";
    case "walking":
      return "bg-teal-400/14";
    case "strength":
      return "bg-amber-400/14";
    case "triathlon":
      return "bg-violet-400/14";
    default:
      return "bg-white/10";
  }
}

function getSummaryCardAccentClass(key: ActivitiesBrowserProps["summaryCards"][number]["key"]) {
  switch (key) {
    case "activities":
      return "bg-sky-300/10 text-sky-300";
    case "distance":
      return "bg-emerald-300/10 text-emerald-300";
    case "duration":
      return "bg-amber-300/10 text-amber-300";
    case "active-days":
      return "bg-violet-300/10 text-violet-300";
    default:
      return "bg-black/10 text-foreground/84";
  }
}

function getSportIconShellClass(sportTone: ActivitiesBrowserProps["groups"][number]["items"][number]["sportTone"]) {
  switch (sportTone) {
    case "swim":
      return "bg-cyan-400/10 text-cyan-200";
    case "bike":
      return "bg-emerald-400/10 text-emerald-200";
    case "run":
      return "bg-orange-400/10 text-orange-200";
    case "walking":
      return "bg-teal-400/10 text-teal-200";
    case "strength":
      return "bg-amber-400/10 text-amber-200";
    case "triathlon":
      return "bg-violet-400/10 text-violet-200";
    default:
      return "bg-white/8 text-foreground/82";
  }
}
