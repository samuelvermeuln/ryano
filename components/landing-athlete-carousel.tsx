"use client";

import type { FocusEvent, ReactNode } from "react";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconChartBar,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconRefresh,
} from "@tabler/icons-react";

import { type DemoConsistencyWeek, type DemoWeeklyDay } from "@/components/landing-athlete-data";
import { SportIcon, sportLabel as getSportLabel } from "@/components/icons/SportIcon";
import { useLandingExperience } from "@/components/landing-experience-context";
import { getPostActivityReportView } from "@/lib/post-activity-report-template";
import { type SessionSport, type Sport } from "@/lib/sports";

export function LandingAthleteCarousel() {
  const {
    athlete,
    direction,
    goToNextSport,
    goToPreviousSport,
    pauseRotation,
    progress,
    reducedMotion,
    resumeRotation,
    selectedSport,
    setSport,
    snapshot,
    sportIndex,
    sportOrder,
  } = useLandingExperience();
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const theme = getSportTheme(selectedSport);
  const reportView = getPostActivityReportView(snapshot, {
    occurredAt: new Date(),
    surface: "landing",
  });
  const mobileReportView = getPostActivityReportView(snapshot, {
    occurredAt: new Date(),
    surface: "landing-mobile",
  });

  function handleTouchStart(clientX: number) {
    pauseRotation();
    setTouchStartX(clientX);
  }

  function handleTouchEnd(clientX: number) {
    if (touchStartX === null) {
      resumeRotation();
      return;
    }

    const delta = clientX - touchStartX;
    setTouchStartX(null);

    if (Math.abs(delta) > 42) {
      if (delta < 0) {
        goToNextSport();
      } else {
        goToPreviousSport();
      }
    }

    resumeRotation();
  }

  function handleBlurCapture(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      resumeRotation();
    }
  }

  return (
    <div className="space-y-6" onFocusCapture={pauseRotation} onBlurCapture={handleBlurCapture}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Veja na prática</p>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Veja exemplo de relatório por modalidade
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-foreground/70 sm:text-base">
            Corrida, ciclismo, natação ou triathlon: cada modalidade destaca as métricas que realmente importam em uma demo ilustrativa.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-medium text-foreground/76">
          <span className={`h-2.5 w-2.5 rounded-full ${theme.dot}`} />
          {snapshot.label}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Selecionar modalidade">
        {sportOrder.map((sport) => {
          const active = sport === selectedSport;

          return (
            <button
              key={sport}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="landing-demo-panel"
              onClick={() => setSport(sport)}
              onMouseEnter={pauseRotation}
              onMouseLeave={resumeRotation}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                active
                  ? `${theme.button} text-foreground`
                  : "border-white/10 bg-white/6 text-foreground/72 hover:bg-white/10 hover:text-foreground"
              }`}
            >
              <SportIcon sport={sport} size={18} className="text-current" />
              <span>{getSportLabel(sport)}</span>
            </button>
          );
        })}
      </div>

      <div className="landing-demo-stage rounded-[30px] border p-5 sm:p-6 lg:p-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Modalidade anterior"
                onClick={goToPreviousSport}
                onMouseEnter={pauseRotation}
                onMouseLeave={resumeRotation}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/8 text-foreground/82 transition hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <IconChevronLeft size={18} stroke={1.9} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Próxima modalidade"
                onClick={goToNextSport}
                onMouseEnter={pauseRotation}
                onMouseLeave={resumeRotation}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/8 text-foreground/82 transition hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <IconChevronRight size={18} stroke={1.9} aria-hidden="true" />
              </button>
            </div>

            {!reducedMotion ? (
              <div className="flex w-full max-w-[180px] items-center gap-2">
                <div className="flex items-center gap-2">
                  {sportOrder.map((sport, index) => (
                    <button
                      key={sport}
                      type="button"
                      aria-label={`Mostrar ${getSportLabel(sport)}`}
                      onClick={() => setSport(sport)}
                      className={`h-2.5 rounded-full transition-all ${
                        index === sportIndex ? `w-8 ${theme.dot}` : "w-2.5 bg-white/28"
                      }`}
                    />
                  ))}
                </div>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className={`h-full origin-left ${theme.dot}`}
                    animate={{ scaleX: progress }}
                    transition={{ duration: 0.08, ease: "linear" }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div
            id="landing-demo-panel"
            role="tabpanel"
            className="mt-5 overflow-hidden rounded-[28px] border border-white/10 bg-white/5 p-4 sm:p-5 lg:p-6"
            onMouseEnter={pauseRotation}
            onMouseLeave={resumeRotation}
            onTouchStart={(event) => handleTouchStart(event.touches[0]?.clientX ?? 0)}
            onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedSport}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.16}
                onDragStart={pauseRotation}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -64) {
                    goToNextSport();
                  } else if (info.offset.x > 64) {
                    goToPreviousSport();
                  }

                  resumeRotation();
                }}
                initial={reducedMotion ? false : { opacity: 0, x: direction > 0 ? 42 : -42 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, x: direction > 0 ? -42 : 42 }}
                transition={{ duration: reducedMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4 sm:grid sm:gap-5 lg:grid-cols-[0.84fr_1.16fr] lg:items-stretch xl:gap-6"
              >
                <div className="sm:hidden">
                  <MobileLandingDemoCard athlete={athlete} snapshot={mobileReportView} consistencySummary={snapshot.consistencySummary} consistencyWeeks={snapshot.consistencyWeeks} sport={selectedSport} theme={theme} reducedMotion={reducedMotion} note={athlete.note} weeklyDays={snapshot.weeklyDays} />
                </div>

                <div className="hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] p-5 sm:block lg:p-6">
                  <div className="flex items-center gap-3">
                    <div className={`grid h-16 w-16 place-items-center rounded-[20px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] ${theme.avatar}`}>
                      <SportIcon sport={selectedSport} size={30} className="text-current" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground">{athlete.name}</p>
                      <p className="mt-1 text-sm text-foreground/68">{athlete.role}</p>
                      <p className="mt-1 text-xs text-foreground/56">{athlete.city}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {reportView.metrics.map((metric) => (
                      <InfoPill key={metric.label} value={metric.value} label={metric.label} />
                    ))}
                  </div>

                  <div className="mt-5 rounded-[22px] border border-white/10 bg-white/8 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/62">Destaque do treino</p>
                    <p className="mt-2 text-sm leading-7 text-foreground/84">{athlete.note}</p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2.5">
                    {snapshot.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/78"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="hidden space-y-4 sm:block lg:space-y-5">
                  <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] p-5 lg:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{snapshot.label}</p>
                        <p className="mt-1 text-xs leading-6 text-foreground/64">{snapshot.summary}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium text-white ${theme.badge}`}>
                        {snapshot.label}
                      </span>
                    </div>
                    <div className="mt-4 rounded-[20px] border border-white/10 bg-white/6 p-4 text-sm leading-7 text-foreground/78">
                      {reportView.insight}
                    </div>
                  </div>

                  {reportView.showWeeklySummary ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <TrainingVolumeChart days={snapshot.weeklyDays} sport={selectedSport} summary={reportView.weeklyTotalLabel ?? "—"} comparison={reportView.weeklyComparison} theme={theme} reducedMotion={reducedMotion} />
                      <ConsistencyChart weeks={snapshot.consistencyWeeks} summary={snapshot.consistencySummary} sport={selectedSport} theme={theme} reducedMotion={reducedMotion} />
                    </div>
                  ) : (
                    <DailyReportCards insight={reportView.insight} metrics={reportView.metrics} chips={reportView.chips} note={athlete.note} />
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
      </div>
    </div>
  );
}

function TrainingVolumeChart({
  days,
  sport,
  summary,
  comparison,
  theme,
  reducedMotion,
}: {
  days: readonly DemoWeeklyDay[];
  sport: Sport;
  summary: string;
  comparison?: string;
  theme: SportTheme;
  reducedMotion: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(findFirstDayWithSessions(days));
  const activeDay = days[activeIndex] ?? days[0];
  const totals = days.map((day) => day.sessions.reduce((sum, session) => sum + session.durationMinutes, 0));
  const maxTotal = Math.max(...totals, 1);

  return (
    <PerformanceCard
      title="Volume de treino"
      subtitle="Quanto você treinou nos últimos 7 dias."
      badge="7 dias"
      icon={<IconChartBar size={18} stroke={1.8} aria-hidden="true" />}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold text-foreground">{summary}</p>
          <p className="mt-1 text-xs text-foreground/64">{comparison ?? "Sem comparação disponível."}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs font-medium text-foreground/76">
          Últimos 7 dias
        </div>
      </div>

      <ChartTooltip title={`${activeDay.dayLabel}, ${activeDay.dateLabel}`}>
        {activeDay.sessions.length > 0 ? (
          <div className="space-y-2">
            {activeDay.sessions.map((session) => (
              <div key={`${activeDay.dayLabel}-${session.label}-${session.valueLabel}`} className="space-y-0.5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className={`h-2.5 w-2.5 rounded-full ${getSessionTheme(session.sport).dot}`} />
                  {session.label}
                </div>
                <p className="text-sm text-foreground/74">{session.valueLabel} · {session.durationLabel}</p>
              </div>
            ))}
            <p className="border-t border-white/10 pt-2 text-sm font-semibold text-foreground">
              Total: {formatMinutesLabel(totals[activeIndex] ?? 0)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-foreground/72">Nenhuma atividade neste dia.</p>
        )}
      </ChartTooltip>

      <div className="mt-4 grid grid-cols-7 gap-2 sm:gap-3">
        {days.map((day, index) => {
          const total = totals[index] ?? 0;
          const activeBar = activeIndex === index;
          const height = total === 0 ? 0 : Math.max((total / maxTotal) * 100, 12);

          return (
            <div key={`${day.dayLabel}-${day.dateLabel}`} className="flex min-w-0 flex-col items-center gap-2">
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                className={`relative flex h-40 w-full items-end overflow-hidden rounded-[18px] border p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                  activeBar ? "border-white/18 bg-white/8" : "border-white/8 bg-white/5"
                }`}
                aria-label={`${day.dayLabel}, ${day.dateLabel}. Total ${formatMinutesLabel(total)}`}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/6" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/8" />
                <div className="relative flex h-full w-full flex-col justify-end overflow-hidden rounded-[14px] bg-white/5">
                  {sport === "triathlon"
                    ? renderStackedBar(day, maxTotal, reducedMotion)
                    : (
                      <motion.div
                        className={`w-full rounded-[14px] ${theme.bar}`}
                        initial={reducedMotion ? false : { height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ duration: reducedMotion ? 0 : 0.45, delay: reducedMotion ? 0 : index * 0.04, ease: [0.22, 1, 0.36, 1] }}
                      />
                    )}
                </div>
              </button>
              <span className="text-[11px] font-medium text-foreground/66">{day.dayLabel}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-foreground/66">
        {sport === "triathlon" ? (
          ["swim", "bike", "run"].map((entry) => {
            const sessionTheme = getSessionTheme(entry as SessionSport);
            return (
              <div key={entry} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${sessionTheme.dot}`} />
                {getSportLabel(entry as Sport)}
              </div>
            );
          })
        ) : (
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${theme.dot}`} />
            {getSportLabel(sport)}
          </div>
        )}
      </div>
    </PerformanceCard>
  );
}

function ConsistencyChart({
  weeks,
  summary,
  sport,
  theme,
  reducedMotion,
}: {
  weeks: readonly DemoConsistencyWeek[];
  summary: string;
  sport: Sport;
  theme: SportTheme;
  reducedMotion: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(weeks.length - 1);
  const maxWorkouts = Math.max(...weeks.map((week) => week.workouts), 1);
  const activeWeek = weeks[activeIndex] ?? weeks[weeks.length - 1];

  return (
    <PerformanceCard
      title="Consistência dos treinos"
      subtitle="Quantos treinos você realizou em cada semana."
      badge="6 semanas"
      icon={<IconRefresh size={18} stroke={1.8} aria-hidden="true" />}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold text-foreground">{summary}</p>
          <p className="mt-1 text-xs text-foreground/64">Visão simples para acompanhar regularidade.</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs font-medium text-foreground/76">
          {getSportLabel(sport)}
        </div>
      </div>

      <ChartTooltip title={activeWeek.label}>
        <p className="text-sm text-foreground/74">
          {activeWeek.workouts} {activeWeek.workouts === 1 ? "treino" : "treinos"} registrados.
        </p>
      </ChartTooltip>

      <div className="mt-4 grid grid-cols-6 gap-2 sm:gap-3">
        {weeks.map((week, index) => {
          const activeBar = activeIndex === index;
          const height = Math.max((week.workouts / maxWorkouts) * 100, 16);

          return (
            <div key={week.label} className="flex min-w-0 flex-col items-center gap-2">
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                className={`relative flex h-40 w-full items-end overflow-hidden rounded-[18px] border bg-white/5 p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                  activeBar ? "border-white/18 bg-white/8" : "border-white/8"
                }`}
                aria-label={`${week.label}. ${week.workouts} treinos.`}
              >
                <motion.div
                  className={`w-full rounded-[14px] ${theme.bar}`}
                  initial={reducedMotion ? false : { height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ duration: reducedMotion ? 0 : 0.42, delay: reducedMotion ? 0 : index * 0.04, ease: [0.22, 1, 0.36, 1] }}
                />
              </button>
              <span className="text-[11px] font-medium text-foreground/66">{week.label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-foreground/66">
        <IconClock size={16} stroke={1.8} aria-hidden="true" />
        Cada barra representa a quantidade de treinos concluídos na semana.
      </div>
    </PerformanceCard>
  );
}

function renderStackedBar(day: DemoWeeklyDay, maxTotal: number, reducedMotion: boolean) {
  const total = day.sessions.reduce((sum, session) => sum + session.durationMinutes, 0);

  return day.sessions.map((session, index) => {
    const sessionTheme = getSessionTheme(session.sport);
    const height = total === 0 ? 0 : Math.max((session.durationMinutes / maxTotal) * 100, 10);

    return (
      <motion.div
        key={`${day.dayLabel}-${session.sport}-${index}`}
        className={`w-full ${sessionTheme.bar} ${index === 0 ? "rounded-t-[14px]" : ""}`}
        initial={reducedMotion ? false : { height: 0 }}
        animate={{ height: `${height}%` }}
        transition={{ duration: reducedMotion ? 0 : 0.45, delay: reducedMotion ? 0 : index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      />
    );
  });
}

function ChartTooltip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/8 p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function PerformanceCard({
  title,
  subtitle,
  badge,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  badge: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/8 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[16px] border border-white/10 bg-white/6 text-foreground/82">
            {icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-xs text-foreground/64">{subtitle}</p>
          </div>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-foreground/78">{badge}</span>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function DailyReportCards({
  insight,
  metrics,
  chips,
  note,
}: {
  insight: string;
  metrics: readonly { label: string; value: string }[];
  chips: readonly string[];
  note: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-[24px] border border-white/10 bg-white/8 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Leitura diária</p>
            <p className="mt-1 text-xs text-foreground/64">Fora de domingo, o relatório foca no treino executado.</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-foreground/78">Hoje</span>
        </div>

        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/6 p-4 text-sm leading-7 text-foreground/78">
          {insight}
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/78"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-[24px] border border-white/10 bg-white/8 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Métricas do treino</p>
            <p className="mt-1 text-xs text-foreground/64">Dados principais para leitura rápida.</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-foreground/78">Resumo</span>
        </div>

        <div className="mt-4 grid gap-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/6 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-foreground/58">{metric.label}</span>
              <span className="text-sm font-semibold text-foreground">{metric.value}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/6 p-4 text-sm leading-7 text-foreground/72">
          {note}
        </div>
      </div>
    </div>
  );
}

function MobileLandingDemoCard({
  athlete,
  snapshot,
  consistencySummary,
  consistencyWeeks,
  note,
  weeklyDays,
  sport,
  theme,
  reducedMotion,
}: {
  athlete: { name: string; role: string; city: string };
  snapshot: {
    label: string;
    summary: string;
    insight: string;
    metrics: readonly { label: string; value: string }[];
    chips: readonly string[];
    weeklyTotalLabel?: string;
    weeklyComparison?: string;
    showWeeklySummary: boolean;
  };
  consistencySummary: string;
  consistencyWeeks: readonly DemoConsistencyWeek[];
  note: string;
  weeklyDays: readonly DemoWeeklyDay[];
  sport: Sport;
  theme: SportTheme;
  reducedMotion: boolean;
}) {
  const highlightedMetrics = snapshot.metrics.slice(0, 3);
  const topDay = getTopVolumeDay(weeklyDays);
  const topWeek = getTopConsistencyWeek(consistencyWeeks);

  return (
    <div className="space-y-3">
      <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-[18px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] ${theme.avatar}`}>
              <SportIcon sport={sport} size={24} className="text-current" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">{athlete.name}</p>
              <p className="mt-1 text-sm text-foreground/68">{athlete.role}</p>
              <p className="mt-1 text-xs text-foreground/56">{athlete.city}</p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-white ${theme.badge}`}>
            {snapshot.label}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {highlightedMetrics.slice(0, 2).map((metric) => (
            <InfoPill key={metric.label} value={metric.value} label={metric.label} />
          ))}
          {highlightedMetrics[2] ? (
            <div className="col-span-2">
              <InfoPill value={highlightedMetrics[2].value} label={highlightedMetrics[2].label} />
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/7 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/60">Leitura do treino</p>
          <p className="mt-2 text-sm leading-6 text-foreground/84">{snapshot.summary}</p>
          <p className="mt-3 text-sm leading-6 text-foreground/72">{snapshot.insight}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {snapshot.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/78"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      {snapshot.showWeeklySummary ? (
        <>
          <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Volume da semana</p>
                <p className="mt-1 text-xs text-foreground/64">Resumo semanal enviado só aos domingos.</p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-foreground/78">7 dias</span>
            </div>

            <div className="mt-4 flex items-end justify-between gap-3 rounded-[20px] border border-white/10 bg-white/6 px-4 py-3">
              <div>
                <p className="text-2xl font-semibold text-foreground">{snapshot.weeklyTotalLabel ?? "—"}</p>
                <p className="mt-1 text-xs text-foreground/64">{snapshot.weeklyComparison ?? "Sem comparação disponível."}</p>
              </div>
              {topDay ? (
                <div className="text-right text-xs text-foreground/68">
                  <p className="font-medium text-foreground">{topDay.dayLabel}</p>
                  <p>{formatMinutesLabel(topDay.totalMinutes)}</p>
                </div>
              ) : null}
            </div>

            <MobileWeeklyBars days={weeklyDays} theme={theme} reducedMotion={reducedMotion} />
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Constância</p>
                <p className="mt-1 text-xs text-foreground/64">Resumo simples para entender rotina.</p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-foreground/78">6 semanas</span>
            </div>

            <div className="mt-4 rounded-[20px] border border-white/10 bg-white/6 p-4">
              <p className="text-lg font-semibold text-foreground">{consistencySummary}</p>
              <p className="mt-2 text-sm leading-6 text-foreground/72">{note}</p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {consistencyWeeks.slice(-3).map((week) => (
                <div key={week.label} className="rounded-[18px] border border-white/10 bg-white/6 px-3 py-3 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/60">{week.label}</p>
                  <p className="mt-1 text-base font-semibold text-foreground">{week.workouts}</p>
                  <p className="text-[10px] text-foreground/58">treinos</p>
                </div>
              ))}
            </div>

            {topWeek ? (
              <div className="mt-4 flex items-center justify-between rounded-[18px] border border-white/10 bg-white/6 px-3 py-3 text-sm text-foreground/72">
                <span>Melhor regularidade recente</span>
                <span className="font-medium text-foreground">{topWeek.label} · {topWeek.workouts}</span>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Leitura diária</p>
              <p className="mt-1 text-xs text-foreground/64">Fora de domingo, mensagem foca no treino executado.</p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-foreground/78">Hoje</span>
          </div>

          <div className="mt-4 rounded-[20px] border border-white/10 bg-white/6 p-4">
            <p className="text-sm font-semibold text-foreground">{snapshot.insight}</p>
            <p className="mt-2 text-sm leading-6 text-foreground/72">{note}</p>
          </div>

          <div className="mt-4 grid gap-3">
            {snapshot.metrics.map((metric) => (
              <div key={metric.label} className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/6 px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-foreground/58">{metric.label}</span>
                <span className="text-sm font-semibold text-foreground">{metric.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileWeeklyBars({
  days,
  theme,
  reducedMotion,
}: {
  days: readonly DemoWeeklyDay[];
  theme: SportTheme;
  reducedMotion: boolean;
}) {
  const totals = days.map((day) => day.sessions.reduce((sum, session) => sum + session.durationMinutes, 0));
  const maxTotal = Math.max(...totals, 1);

  return (
    <div className="mt-4 grid grid-cols-7 gap-2">
      {days.map((day, index) => {
        const total = totals[index] ?? 0;
        const height = total === 0 ? 10 : Math.max((total / maxTotal) * 100, 18);

        return (
          <div key={`${day.dayLabel}-${day.dateLabel}`} className="flex min-w-0 flex-col items-center gap-2">
            <div className="flex h-20 w-full items-end overflow-hidden rounded-[16px] border border-white/8 bg-white/5 p-1">
              <motion.div
                className={`w-full rounded-[12px] ${theme.bar}`}
                initial={reducedMotion ? false : { height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ duration: reducedMotion ? 0 : 0.35, delay: reducedMotion ? 0 : index * 0.03, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-medium text-foreground/68">{day.dayLabel}</p>
              <p className="text-[9px] text-foreground/52">{total > 0 ? formatMinutesLabel(total) : "-"}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InfoPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/8 px-4 py-4">
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/62">{label}</p>
    </div>
  );
}

function getTopVolumeDay(days: readonly DemoWeeklyDay[]) {
  return days
    .map((day) => ({
      dayLabel: day.dayLabel,
      totalMinutes: day.sessions.reduce((sum, session) => sum + session.durationMinutes, 0),
    }))
    .filter((day) => day.totalMinutes > 0)
    .sort((left, right) => right.totalMinutes - left.totalMinutes)[0] ?? null;
}

function getTopConsistencyWeek(weeks: readonly DemoConsistencyWeek[]) {
  return [...weeks].sort((left, right) => right.workouts - left.workouts)[0] ?? null;
}

type SportTheme = {
  dot: string;
  button: string;
  avatar: string;
  badge: string;
  bar: string;
};

function getSportTheme(sport: Sport): SportTheme {
  if (sport === "swim") {
    return {
      dot: "bg-[var(--sport-swimming-dark)]",
      button: "border-[color:var(--sport-swimming-dark)]/30 bg-[color:var(--sport-swimming-dark)]/18",
      avatar: "bg-[linear-gradient(135deg,var(--sport-swimming-light),var(--sport-swimming-dark))]",
      badge: "bg-[linear-gradient(135deg,var(--sport-swimming-light),var(--sport-swimming-dark))]",
      bar: "bg-[linear-gradient(180deg,var(--sport-swimming-dark),var(--sport-swimming-light))]",
    };
  }

  if (sport === "bike") {
    return {
      dot: "bg-[var(--sport-cycling-dark)]",
      button: "border-[color:var(--sport-cycling-dark)]/30 bg-[color:var(--sport-cycling-dark)]/18",
      avatar: "bg-[linear-gradient(135deg,var(--sport-cycling-light),var(--sport-cycling-dark))]",
      badge: "bg-[linear-gradient(135deg,var(--sport-cycling-light),var(--sport-cycling-dark))]",
      bar: "bg-[linear-gradient(180deg,var(--sport-cycling-dark),var(--sport-cycling-light))]",
    };
  }

  if (sport === "triathlon") {
    return {
      dot: "bg-[var(--sport-triathlon-dark)]",
      button: "border-[color:var(--sport-triathlon-dark)]/30 bg-[color:var(--sport-triathlon-dark)]/18",
      avatar: "bg-[linear-gradient(135deg,var(--sport-triathlon-light),var(--sport-triathlon-dark))]",
      badge: "bg-[linear-gradient(135deg,var(--sport-triathlon-light),var(--sport-triathlon-dark))]",
      bar: "bg-[linear-gradient(180deg,var(--sport-triathlon-dark),var(--sport-triathlon-light))]",
    };
  }

  return {
    dot: "bg-[var(--sport-running-dark)]",
    button: "border-[color:var(--sport-running-dark)]/30 bg-[color:var(--sport-running-dark)]/18",
    avatar: "bg-[linear-gradient(135deg,var(--sport-running-light),var(--sport-running-dark))]",
    badge: "bg-[linear-gradient(135deg,var(--sport-running-light),var(--sport-running-dark))]",
    bar: "bg-[linear-gradient(180deg,var(--sport-running-dark),var(--sport-running-light))]",
  };
}

function getSessionTheme(sport: SessionSport) {
  if (sport === "swim") {
    return {
      dot: "bg-[var(--sport-swimming-dark)]",
      bar: "bg-[linear-gradient(180deg,var(--sport-swimming-dark),var(--sport-swimming-light))]",
    };
  }

  if (sport === "bike") {
    return {
      dot: "bg-[var(--sport-cycling-dark)]",
      bar: "bg-[linear-gradient(180deg,var(--sport-cycling-dark),var(--sport-cycling-light))]",
    };
  }

  return {
    dot: "bg-[var(--sport-running-dark)]",
    bar: "bg-[linear-gradient(180deg,var(--sport-running-dark),var(--sport-running-light))]",
  };
}

function findFirstDayWithSessions(days: readonly DemoWeeklyDay[]) {
  const index = days.findIndex((day) => day.sessions.length > 0);
  return index === -1 ? 0 : index;
}

function formatMinutesLabel(value: number) {
  if (value <= 0) {
    return "0 min";
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
  }

  return `${minutes} min`;
}
