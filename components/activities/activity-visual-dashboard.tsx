"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

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
}: ActivityVisualDashboardProps) {
  const reducedMotion = Boolean(useReducedMotion());

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(192,132,252,0.16),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {reducedMotion ? null : (
            <>
              <motion.span
                className="absolute -left-6 top-10 h-28 w-28 rounded-full bg-cyan-400/18 blur-3xl"
                animate={{ x: [0, 28, 0], y: [0, -18, 0], scale: [1, 1.12, 1] }}
                transition={{ duration: 7.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.span
                className="absolute right-0 top-0 h-32 w-32 rounded-full bg-fuchsia-400/16 blur-3xl"
                animate={{ x: [0, -24, 0], y: [0, 18, 0], scale: [1, 1.15, 1] }}
                transition={{ duration: 6.8, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.span
                className="absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-emerald-400/14 blur-3xl"
                animate={{ y: [0, -16, 0], x: [0, 10, 0], scale: [1, 1.08, 1] }}
                transition={{ duration: 5.6, repeat: Infinity, ease: "easeInOut" }}
              />
            </>
          )}
        </div>

        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.18em] text-foreground/58">
              <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1">{provider}</span>
              <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1">{sportLabel}</span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2.2rem]">{title}</h1>
            <p className="mt-3 text-sm leading-7 text-foreground/66">Atividade iniciada em {startedAtLabel}. Painel usa apenas dados reais retornados pela Garmin e salvos no Ryvano.</p>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-2xl">
            {heroStats.map((stat, index) => (
              <motion.div
                key={stat.label}
                className="rounded-[22px] border border-white/10 bg-black/12 px-4 py-4 backdrop-blur"
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.08 }}
              >
                <p className="text-xs uppercase tracking-[0.18em] text-foreground/48">{stat.label}</p>
                <motion.p
                  className={`mt-3 text-2xl font-semibold ${stat.tone}`}
                  animate={reducedMotion ? undefined : { textShadow: ["0 0 0px rgba(255,255,255,0)", "0 0 18px rgba(125,211,252,0.16)", "0 0 0px rgba(255,255,255,0)"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: index * 0.2 }}
                >
                  {stat.value}
                </motion.p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <ChartCard title="Resumo do treino" description="Principais números desta atividade com leitura rápida e visual mais limpa.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {overviewMetrics.map((metric, index) => (
            <motion.div
              key={metric.label}
              className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4"
              initial={reducedMotion ? false : { opacity: 0, y: 14 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: index * 0.03 }}
              whileHover={reducedMotion ? undefined : { y: -3, scale: 1.01 }}
            >
              <p className="text-sm text-foreground/55">{metric.label}</p>
              <motion.p
                className="mt-2 text-lg font-semibold tracking-tight text-foreground"
                animate={reducedMotion ? undefined : { opacity: [0.92, 1, 0.92] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: index * 0.1 }}
              >
                {metric.value}
              </motion.p>
            </motion.div>
          ))}
        </div>
      </ChartCard>

      {barSections.length ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {barSections.map((section) => (
            <ChartCard key={section.title} title={section.title} description={section.description}>
              <AnimatedBarList items={section.items} reducedMotion={reducedMotion} />
            </ChartCard>
          ))}
        </section>
      ) : null}

      {metricSections.length ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {metricSections.map((section) => (
            <ChartCard key={section.title} title={section.title} description={section.description}>
              <div className="grid gap-3 sm:grid-cols-2">
                {section.metrics.map((metric, index) => (
                  <motion.div
                    key={metric.label}
                    className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4"
                    initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                    animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, delay: index * 0.03 }}
                  >
                    <p className="text-sm text-foreground/55">{metric.label}</p>
                    <p className="mt-2 text-base font-semibold tracking-tight text-foreground">{metric.value}</p>
                  </motion.div>
                ))}
              </div>
            </ChartCard>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ChartCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-[26px] border border-white/10 bg-white/5 p-5 sm:p-6">
      <div className="flex flex-col gap-2 border-b border-white/10 pb-5">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-sm leading-7 text-foreground/62">{description}</p>
      </div>
      <div className="mt-5">{children}</div>
    </section>
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
