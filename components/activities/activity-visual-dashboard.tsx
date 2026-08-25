"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { IconBolt, IconChartBar, IconFlame, IconTrendingUp } from "@tabler/icons-react";

import { saveActivityLayoutOrderAction } from "@/app/actions/activities";
import {
  CustomizableCardGrid,
  type CustomizableCardGridItem,
  type SavedCardLayoutValue,
} from "@/components/layout/customizable-card-grid";
import type {
  ActivityBarSection,
  ActivityHeroStat,
  ActivityMetricRow,
  ActivityMetricSection,
} from "@/server/services/garmin-activity-details";

type ActivityVisualDashboardProps = {
  title: string;
  sportLabel: string;
  provider: string;
  startedAtLabel: string;
  heroStats: ActivityHeroStat[];
  overviewMetrics: ActivityMetricRow[];
  barSections: ActivityBarSection[];
  metricSections: ActivityMetricSection[];
  savedLayout?: SavedCardLayoutValue;
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
    y: 14,
  },
  show: {
    opacity: 1,
    y: 0,
  },
};

export function ActivityVisualDashboard({
  title,
  sportLabel,
  provider,
  startedAtLabel,
  heroStats,
  overviewMetrics,
  barSections,
  metricSections,
  savedLayout,
}: ActivityVisualDashboardProps) {
  const reducedMotion = Boolean(useReducedMotion());

  const items = useMemo<CustomizableCardGridItem[]>(() => {
    const overviewItem: CustomizableCardGridItem = {
      id: "overview",
      label: "Resumo do treino",
      defaultSpan: 2,
      accentClassName: "before:bg-sky-300/80",
      content: (
        <>
          <MetricHeader
            icon={<IconTrendingUp size={22} />}
            title="Resumo do treino"
            subtitle="Leitura rápida do que a Garmin trouxe para esta atividade."
            colorClass="text-sky-300"
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {overviewMetrics.map((metric) => (
              <MetricCell key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>
        </>
      ),
    };

    return [
      overviewItem,
      ...barSections.map((section) => ({
        id: `bar:${section.id}`,
        label: section.title,
        defaultSpan: 1 as const,
        accentClassName: "before:bg-violet-300/80",
        content: (
          <>
            <MetricHeader
              icon={<IconChartBar size={22} />}
              title={section.title}
              subtitle={section.description}
              colorClass="text-violet-300"
            />
            <div className="mt-5">
              <AnimatedBarList items={section.items} reducedMotion={reducedMotion} />
            </div>
          </>
        ),
      })),
      ...metricSections.map((section, index) => ({
        id: `metric:${section.id}`,
        label: section.title,
        defaultSpan: 1 as const,
        accentClassName: index % 2 === 0 ? "before:bg-amber-300/80" : "before:bg-white/35",
        content: (
          <>
            <MetricHeader
              icon={index % 2 === 0 ? <IconFlame size={22} /> : <IconBolt size={22} />}
              title={section.title}
              subtitle={section.description}
              colorClass={index % 2 === 0 ? "text-amber-300" : "text-foreground/80"}
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {section.metrics.map((metric) => (
                <MetricCell key={metric.label} label={metric.label} value={metric.value} />
              ))}
            </div>
          </>
        ),
      })),
    ];
  }, [barSections, metricSections, overviewMetrics, reducedMotion]);

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={reducedMotion ? undefined : containerVariants}
      className="space-y-5"
    >
      <motion.section
        variants={reducedMotion ? undefined : itemVariants}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.12)] sm:p-6"
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-foreground/42">Atividade</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-[2.2rem]">{title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-foreground/66">
              {sportLabel} sincronizada em {startedAtLabel}. Arraste o ícone dos cards para reorganizar e use o controle lateral para ampliar ou reduzir a largura de cada bloco.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill label={provider} tone="neutral" />
              <StatusPill label={sportLabel} tone="success" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
            {heroStats.map((stat, index) => (
              <motion.div
                key={stat.label}
                className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-4"
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.34, delay: index * 0.06 }}
              >
                <p className="text-xs uppercase tracking-[0.18em] text-foreground/46">{stat.label}</p>
                <p className={`mt-3 text-2xl font-semibold tracking-tight ${stat.tone}`}>{stat.value}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section variants={reducedMotion ? undefined : itemVariants} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}>
        <CustomizableCardGrid
          items={items}
          savedLayout={savedLayout}
          onSave={saveActivityLayoutOrderAction}
          pendingDescription="Sua nova ordem e o novo tamanho dos cards desta atividade foram detectados. Salve para aplicar na sua conta."
        />
      </motion.section>
    </motion.div>
  );
}

function MetricHeader({ icon, title, subtitle, colorClass }: { icon: ReactNode; title: string; subtitle?: string; colorClass: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/10 ${colorClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-[0.95rem] font-medium text-foreground">{title}</p>
        {subtitle ? <p className="mt-1 text-sm leading-6 text-foreground/58">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "success" | "neutral" }) {
  const toneClass = tone === "success" ? "theme-pill-success" : "theme-pill-neutral";

  return (
    <div className={`inline-flex items-center rounded-full border px-3 py-2 text-xs font-semibold tracking-[0.14em] ${toneClass}`}>
      {label}
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <motion.div
      className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-4"
      whileHover={{ y: -3, scale: 1.01 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="text-sm text-foreground/55">{label}</p>
      <p className="mt-2 text-base font-semibold tracking-tight text-foreground">{value}</p>
    </motion.div>
  );
}

function AnimatedBarList({
  items,
  reducedMotion,
}: {
  items: Array<{ label: string; valueText: string; ratio: number; color: string }>;
  reducedMotion: boolean;
}) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        const width = `${Math.max(item.ratio * 100, 8)}%`;

        return (
          <div key={`${item.label}-${index}`} className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground/76">{item.label}</span>
              <span className="text-right text-foreground/58">{item.valueText}</span>
            </div>
            <div className="relative h-4 overflow-hidden rounded-full bg-white/8">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: item.color }}
                initial={{ width: 0 }}
                animate={reducedMotion ? { width } : { width, filter: ["brightness(1)", "brightness(1.18)", "brightness(1)"] }}
                transition={{ duration: reducedMotion ? 0.4 : 1.2, ease: [0.22, 1, 0.36, 1], repeat: reducedMotion ? 0 : Infinity, repeatDelay: 0.8, delay: index * 0.06 }}
              />
              {reducedMotion ? null : (
                <motion.div
                  className="absolute inset-y-0 w-20 rounded-full bg-white/35 blur-md"
                  animate={{ x: ["-25%", "220%"] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "linear", delay: index * 0.18 }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
