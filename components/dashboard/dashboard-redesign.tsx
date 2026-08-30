"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  IconActivityHeartbeat,
  IconBolt,
  IconChevronDown,
  IconClock,
  IconFlame,
  IconHeart,
  IconMoon,
  IconRefresh,
  IconTrendingUp,
  IconWalk,
} from "@tabler/icons-react";

import { saveDashboardLayoutAction } from "@/app/actions/dashboard-layout";
import {
  CustomizableCardGrid,
  type CustomizableCardGridItem,
  type SavedCardLayoutValue,
} from "@/components/layout/customizable-card-grid";
import { humanizeActivityLabel } from "@/lib/activity-text";
import {
  formatCalories,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatHeartRate,
} from "@/lib/format";
import { UserAvatar } from "@/components/user-avatar";

type TrendBucket = {
  label: string;
  activityCount: number;
  durationSeconds: number;
  distanceMeters: number;
};

type RecentActivity = {
  id: string;
  name: string | null;
  sportType: string;
  startedAt: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  calories: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  metrics: Record<string, unknown> | null;
};

type DashboardRedesignProps = {
  userFirstName: string;
  userName: string;
  userImage?: string | null;
  selectedDays: 7 | 30 | 90 | 365;
  activityCount: number;
  peakWeekLabel: string | null;
  peakWeekActivityCount: number | null;
  peakWeekDurationSeconds: number | null;
  alerts: string[];
  trend: TrendBucket[];
  latestActivity: RecentActivity | null;
  savedLayout?: SavedCardLayoutValue;
  summary: {
    predominantSport: string | null;
    totalDurationSeconds: number;
    totalDistanceMeters: number;
    trainingDays: number;
    garminConnection: {
      status: string;
      lastSyncAt: string | null;
      lastSyncStatus: string | null;
    } | null;
    latestGarminReconnectNotification: {
      createdAt: string;
    } | null;
    whatsappIdentity: {
      verifiedAt: string | null;
      phoneE164: string;
    } | null;
    garminToday: {
      summary: {
        steps: number | null;
        distanceMeters: number | null;
        totalKilocalories: number | null;
        activeKilocalories: number | null;
        restingHeartRate: number | null;
        bodyBatteryHighest: number | null;
        bodyBatteryLowest: number | null;
      };
      sleep: {
        durationSeconds: number | null;
        score: number | null;
        avgSleepHrv: number | null;
      };
      hrv: {
        lastNightAvg: number | null;
        weeklyAvg: number | null;
        status: string | null;
      };
      readiness: {
        score: number | null;
        level: string | null;
        recoveryTimeMinutes: number | null;
        feedback: string | null;
      };
      warnings: string[];
    } | null;
  };
};

const PERIOD_OPTIONS = [7, 30, 90, 365] as const;
const chartTabs = ["activities", "duration", "distance"] as const;
type ChartTab = (typeof chartTabs)[number];

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

export function DashboardRedesign(props: DashboardRedesignProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const [chartTab, setChartTab] = useState<ChartTab>("activities");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const readinessState = getReadinessState(props.summary.garminToday?.readiness.score ?? null);
  const bodyBattery = props.summary.garminToday?.summary;
  const insight = getPrimaryInsight(props);
  const technicalGroups = buildTechnicalGroups(props);
  const noDailyData = !props.summary.garminToday;
  const combinedAlerts = useMemo(
    () => [...props.alerts, ...(props.summary.garminToday?.warnings ?? [])],
    [props.alerts, props.summary.garminToday?.warnings],
  );

  const compactStatuses = [
    {
      label: "Garmin",
      value: getGarminStatusLabel(props.summary.garminConnection?.status),
      tone: props.summary.garminConnection?.status === "CONNECTED" ? "success" : props.summary.garminConnection?.status === "RECONNECT_REQUIRED" ? "danger" : "warning",
    },
    {
      label: "WhatsApp",
      value: props.summary.whatsappIdentity?.verifiedAt ? "Conectado" : "Pendente",
      tone: props.summary.whatsappIdentity?.verifiedAt ? "success" : "warning",
    },
  ] as const;

  const chartData = useMemo(() => {
    return props.trend.map((bucket) => {
      if (chartTab === "duration") {
        return {
          ...bucket,
          value: bucket.durationSeconds,
          valueLabel: formatDuration(bucket.durationSeconds),
        };
      }

      if (chartTab === "distance") {
        return {
          ...bucket,
          value: bucket.distanceMeters,
          valueLabel: formatDistance(bucket.distanceMeters),
        };
      }

      return {
        ...bucket,
        value: bucket.activityCount,
        valueLabel: `${bucket.activityCount} atividade(s)`,
      };
    });
  }, [chartTab, props.trend]);

  const items = useMemo<CustomizableCardGridItem[]>(() => {
    const nextItems: CustomizableCardGridItem[] = [
      {
        id: "readiness",
        label: "Prontidão",
        defaultSpan: 2,
        accentClassName: "before:bg-emerald-300/80",
        content: (
          <>
            <MetricHeader icon={<IconBolt size={22} />} title="Prontidão" subtitle={readinessState.label} colorClass="text-emerald-300" />
            {props.summary.garminToday?.readiness.score !== null && props.summary.garminToday?.readiness.score !== undefined ? (
              <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <MetricValue value={String(Math.round(props.summary.garminToday.readiness.score))} suffix="/100" />
                  <p className="mt-3 max-w-md text-sm leading-7 text-foreground/64">
                    {props.summary.garminToday.readiness.feedback ?? getReadinessFallbackText(readinessState.label)}
                  </p>
                </div>
                <ProgressRing value={props.summary.garminToday.readiness.score} tone={readinessState.ringTone} />
              </div>
            ) : (
              <EmptyMetricState title="Sem leitura de prontidão" description="Sincronize novamente para atualizar esta métrica." />
            )}
          </>
        ),
      },
      {
        id: "body-battery",
        label: "Energia corporal",
        defaultSpan: 2,
        accentClassName: "before:bg-green-300/80",
        content: (
          <>
            <MetricHeader icon={<IconActivityHeartbeat size={22} />} title="Energia corporal" subtitle="Leitura Body Battery da Garmin" colorClass="text-green-300" />
            {bodyBattery?.bodyBatteryHighest !== null && bodyBattery?.bodyBatteryHighest !== undefined ? (
              <div className="mt-5 space-y-4">
                <div className="flex items-end justify-between gap-5">
                  <div>
                    <p className="text-sm text-foreground/56">máximo do dia</p>
                    <MetricValue value={String(Math.round(bodyBattery.bodyBatteryHighest))} />
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-foreground/56">mínimo</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{bodyBattery.bodyBatteryLowest !== null && bodyBattery.bodyBatteryLowest !== undefined ? Math.round(bodyBattery.bodyBatteryLowest) : "Sem dado"}</p>
                  </div>
                </div>
                <BodyBatteryBar low={bodyBattery.bodyBatteryLowest} high={bodyBattery.bodyBatteryHighest} reducedMotion={reduceMotion} />
              </div>
            ) : (
              <EmptyMetricState title="Sem leitura de energia" description="Sincronize novamente para atualizar esta métrica." />
            )}
          </>
        ),
      },
      {
        id: "resting-heart-rate",
        label: "Frequência cardíaca",
        defaultSpan: 1,
        accentClassName: "before:bg-rose-300/80",
        content: (
          <>
            <MetricHeader icon={<IconHeart size={22} />} title="Frequência cardíaca" subtitle="Em repouso" colorClass="text-rose-300" />
            {props.summary.garminToday?.summary.restingHeartRate ? (
              <>
                <MetricValue value={String(Math.round(props.summary.garminToday.summary.restingHeartRate))} suffix=" bpm" />
                <p className="mt-3 text-sm leading-7 text-foreground/64">Leitura diária de repouso recebida da Garmin.</p>
              </>
            ) : (
              <EmptyMetricState title="Sem leitura de frequência cardíaca" description="Sincronize novamente para atualizar esta métrica." compact />
            )}
          </>
        ),
      },
      {
        id: "sleep",
        label: "Sono",
        defaultSpan: 1,
        accentClassName: "before:bg-indigo-300/80",
        content: (
          <>
            <MetricHeader icon={<IconMoon size={22} />} title="Sono" subtitle="Recuperação noturna" colorClass="text-indigo-300" />
            {props.summary.garminToday?.sleep.durationSeconds ? (
              <>
                <MetricValue value={formatDuration(props.summary.garminToday.sleep.durationSeconds)} />
                <p className="mt-3 text-sm leading-7 text-foreground/64">
                  {props.summary.garminToday.sleep.score !== null ? `Score ${Math.round(props.summary.garminToday.sleep.score)}/100` : "Duração total registrada durante a noite."}
                </p>
              </>
            ) : (
              <EmptyMetricState title="Sem dados de sono" description="Use seu dispositivo durante a noite para acompanhar recuperação e qualidade do sono." compact />
            )}
          </>
        ),
      },
      {
        id: "hrv",
        label: "HRV",
        defaultSpan: 1,
        accentClassName: "before:bg-violet-300/80",
        content: (
          <>
            <MetricHeader icon={<IconTrendingUp size={22} />} title="HRV" subtitle="Variabilidade cardíaca" colorClass="text-violet-300" />
            {props.summary.garminToday?.hrv.status || props.summary.garminToday?.hrv.lastNightAvg !== null ? (
              <>
                <MetricValue value={translateHrvStatus(props.summary.garminToday?.hrv.status) ?? formatHrv(props.summary.garminToday?.hrv.lastNightAvg ?? null)} />
                <p className="mt-3 text-sm leading-7 text-foreground/64">
                  {props.summary.garminToday?.hrv.lastNightAvg !== null && props.summary.garminToday?.hrv.lastNightAvg !== undefined ? `${formatHrv(props.summary.garminToday.hrv.lastNightAvg)} na última noite` : "Sua variabilidade está dentro do intervalo esperado."}
                </p>
              </>
            ) : (
              <EmptyMetricState title="Sem dados de HRV" description="Use seu dispositivo durante a noite para acompanhar esta métrica." compact />
            )}
          </>
        ),
      },
      {
        id: "movement",
        label: "Movimento hoje",
        defaultSpan: 1,
        accentClassName: "before:bg-cyan-300/80",
        content: (
          <>
            <MetricHeader icon={<IconWalk size={22} />} title="Movimento hoje" subtitle="Passos, distância e calorias ativas" colorClass="text-cyan-300" />
            {props.summary.garminToday ? (
              <div className="mt-4 space-y-4">
                <div>
                  <MetricValue value={formatCount(props.summary.garminToday.summary.steps)} />
                  <p className="mt-1 text-sm text-foreground/56">passos</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <CompactMetric label="distância" value={formatDistance(props.summary.garminToday.summary.distanceMeters)} />
                  <CompactMetric label="ativas" value={formatCalories(props.summary.garminToday.summary.activeKilocalories)} />
                </div>
              </div>
            ) : (
              <EmptyMetricState title="Sem dados de movimento" description="Sincronize novamente para atualizar esta métrica." compact />
            )}
          </>
        ),
      },
      {
        id: "insight",
        label: "Insight principal",
        defaultSpan: 2,
        accentClassName: "before:bg-amber-300/80",
        content: (
          <>
            <MetricHeader icon={<IconTrendingUp size={22} />} title={insight.title} subtitle="Insight principal" colorClass="text-amber-300" />
            <p className="mt-4 max-w-3xl text-base leading-8 text-foreground/72">{insight.message}</p>
          </>
        ),
      },
      {
        id: "period-summary",
        label: "Resumo do período",
        defaultSpan: 1,
        accentClassName: "before:bg-orange-300/80",
        content: (
          <>
            <MetricHeader icon={<IconClock size={22} />} title={`Resumo dos últimos ${props.selectedDays} dias`} subtitle="Volume do período" colorClass="text-orange-300" />
            <div className="mt-5 space-y-5">
              <div>
                <AnimatedNumber value={props.activityCount} reducedMotion={reduceMotion} className="text-5xl font-semibold tracking-tight text-foreground" />
                <p className="mt-2 text-sm text-foreground/56">atividades</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <CompactMetric label="tempo total" value={formatDuration(props.summary.totalDurationSeconds)} />
                <CompactMetric label="distância" value={formatDistance(props.summary.totalDistanceMeters)} />
                <CompactMetric label="dias ativos" value={`${props.summary.trainingDays}`} />
                <CompactMetric label="modalidade predominante" value={humanizeSport(props.summary.predominantSport) ?? "Sem predominância"} />
              </div>
            </div>
          </>
        ),
      },
      {
        id: "evolution",
        label: "Evolução",
        defaultSpan: 1,
        accentClassName: "before:bg-sky-300/80",
        content: (
          <>
            <div className="flex flex-col gap-4 border-b border-white/8 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <MetricHeader icon={<IconTrendingUp size={22} />} title="Evolução" subtitle="Acompanhe atividades, duração e distância" colorClass="text-sky-300" />
              </div>
              <div className="flex flex-wrap gap-2">
                {chartTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setChartTab(tab)}
                    className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${chartTab === tab ? "bg-white text-black" : "border border-white/10 bg-white/5 text-foreground hover:bg-white/8"}`}
                  >
                    {tab === "activities" ? "Atividades" : tab === "duration" ? "Duração" : "Distância"}
                  </button>
                ))}
              </div>
            </div>

            {props.activityCount ? (
              <div className="mt-5">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={chartTab}
                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                    animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <EvolutionBars data={chartData} peakLabel={props.peakWeekLabel} reducedMotion={reduceMotion} />
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : (
              <div className="mt-5 rounded-[20px] border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-medium text-foreground">Sem dados disponíveis</p>
                <p className="mt-2 text-sm leading-7 text-foreground/62">Conecte uma integração para começar a acompanhar sua evolução.</p>
              </div>
            )}
          </>
        ),
      },
      {
        id: "recent-activity",
        label: "Atividade recente",
        defaultSpan: 1,
        accentClassName: "before:bg-cyan-300/80",
        content: <RecentActivityContent activity={props.latestActivity} />,
      },
      {
        id: "technical",
        label: "Dados técnicos",
        defaultSpan: 1,
        accentClassName: "before:bg-white/35",
        content: <TechnicalGroupsContent groups={technicalGroups} reducedMotion={reduceMotion} />,
      },
    ];

    if (noDailyData || combinedAlerts.length) {
      nextItems.push({
        id: "alerts",
        label: "Alertas úteis",
        defaultSpan: 2,
        accentClassName: "before:bg-amber-300/80",
        content: (
          <>
            <MetricHeader icon={<IconFlame size={22} />} title="Alertas úteis" subtitle="Mensagens importantes do momento" colorClass="text-amber-300" />
            <div className="mt-5 grid gap-3">
              {combinedAlerts.map((alert) => (
                <div key={alert} className="theme-panel-warning rounded-[18px] border px-4 py-4 text-sm leading-7">
                  {alert}
                </div>
              ))}
            </div>
          </>
        ),
      });
    }

    return nextItems;
  }, [
    bodyBattery,
    chartData,
    chartTab,
    combinedAlerts,
    insight,
    noDailyData,
    props.activityCount,
    props.latestActivity,
    props.peakWeekLabel,
    props.selectedDays,
    props.summary.garminToday,
    props.summary.predominantSport,
    props.summary.totalDistanceMeters,
    props.summary.totalDurationSeconds,
    props.summary.trainingDays,
    readinessState.label,
    readinessState.ringTone,
    reduceMotion,
    technicalGroups,
  ]);

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={reduceMotion ? undefined : containerVariants}
      className="space-y-5"
    >
      <motion.section
        variants={reduceMotion ? undefined : itemVariants}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.12)] sm:p-6"
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-4">
            <UserAvatar name={props.userName} image={props.userImage} size="lg" />
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-foreground/42">Dashboard</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-[2.2rem]">Olá, {props.userFirstName}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-foreground/66">{buildHeroSubtitle(props)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {compactStatuses.map((status) => (
                  <CompactStatusPill key={status.label} {...status} />
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((days) => {
              const active = props.selectedDays === days;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams.toString());
                    next.set("days", String(days));
                    startTransition(() => {
                      router.push(`${pathname}?${next.toString()}`);
                    });
                  }}
                  className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${
                    active
                      ? "bg-white text-black"
                      : "border border-white/10 bg-white/5 text-foreground hover:bg-white/8"
                  } ${isPending && active ? "opacity-70" : ""}`}
                >
                  {days} dias
                </button>
              );
            })}
          </div>
        </div>
      </motion.section>

      <motion.section variants={reduceMotion ? undefined : itemVariants} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}>
        <CustomizableCardGrid
          items={items}
          savedLayout={props.savedLayout}
          onSave={saveDashboardLayoutAction}
          pendingDescription="A nova ordem e a nova largura dos cards do dashboard foram detectadas. Salve para manter esse layout na sua conta."
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

function MetricValue({ value, suffix }: { value: string; suffix?: string }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <p className="text-[2.35rem] font-semibold tracking-tight text-foreground sm:text-[2.75rem]">{value}</p>
      {suffix ? <p className="pb-1 text-sm text-foreground/52">{suffix}</p> : null}
    </div>
  );
}

function CompactStatusPill({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" }) {
  const toneClass = tone === "success" ? "theme-pill-success" : tone === "danger" ? "theme-pill-danger" : "theme-pill-warning";
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold tracking-[0.14em] ${toneClass}`}>
      <span>{label}</span>
      <span>•</span>
      <span>{value}</span>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-4">
      <p className="text-xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-sm text-foreground/56">{label}</p>
    </div>
  );
}

function EmptyMetricState({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return (
    <div className={`mt-5 rounded-[20px] border border-white/10 bg-black/10 px-4 py-4 ${compact ? "min-h-[140px]" : "min-h-[180px]"}`}>
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-7 text-foreground/62">{description}</p>
    </div>
  );
}

function ProgressRing({ value, tone }: { value: number; tone: string }) {
  const reduceMotion = Boolean(useReducedMotion());
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const safeValue = Math.max(0, Math.min(100, value));
  const dashOffset = circumference - (safeValue / 100) * circumference;

  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: reduceMotion ? 0.1 : 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <AnimatedNumber value={Math.round(value)} reducedMotion={reduceMotion} className="text-3xl font-semibold tracking-tight text-foreground" />
      </div>
    </div>
  );
}

function BodyBatteryBar({ low, high, reducedMotion }: { low: number | null; high: number | null; reducedMotion: boolean }) {
  const safeLow = Math.max(0, Math.min(100, low ?? 0));
  const safeHigh = Math.max(0, Math.min(100, high ?? 0));
  const left = `${Math.min(safeLow, safeHigh)}%`;
  const width = `${Math.max(Math.abs(safeHigh - safeLow), 8)}%`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-foreground/48">
        <span>0</span>
        <span>100</span>
      </div>
      <div className="relative h-4 overflow-hidden rounded-full bg-white/8">
        <motion.div
          className="absolute inset-y-0 rounded-full bg-[linear-gradient(90deg,rgba(52,211,153,0.9),rgba(20,184,166,0.9))]"
          initial={{ left: 0, width: 0 }}
          animate={{ left, width }}
          transition={{ duration: reducedMotion ? 0.1 : 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function EvolutionBars({ data, peakLabel, reducedMotion }: { data: Array<TrendBucket & { value: number; valueLabel: string }>; peakLabel: string | null; reducedMotion: boolean }) {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const max = Math.max(...data.map((item) => item.value), 1);
  const active = data.find((item) => item.label === hoveredLabel) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid h-64 grid-cols-[repeat(auto-fit,minmax(42px,1fr))] items-end gap-3">
        {data.map((bucket, index) => {
          const height = `${bucket.value > 0 ? Math.max((bucket.value / max) * 100, 10) : 6}%`;
          const highlighted = peakLabel === bucket.label && bucket.value > 0;

          return (
            <button
              key={bucket.label}
              type="button"
              onMouseEnter={() => setHoveredLabel(bucket.label)}
              onMouseLeave={() => setHoveredLabel((current) => (current === bucket.label ? null : current))}
              onFocus={() => setHoveredLabel(bucket.label)}
              onBlur={() => setHoveredLabel((current) => (current === bucket.label ? null : current))}
              className="flex h-full flex-col justify-end text-left"
            >
              <div className="relative flex flex-1 items-end">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height }}
                  transition={{ duration: reducedMotion ? 0.1 : 0.55, ease: [0.22, 1, 0.36, 1], delay: reducedMotion ? 0 : index * 0.04 }}
                  className={`w-full rounded-t-[18px] ${highlighted ? "bg-[linear-gradient(180deg,rgba(96,165,250,0.95),rgba(59,130,246,0.72))]" : "bg-[linear-gradient(180deg,rgba(255,255,255,0.75),rgba(255,255,255,0.18))]"}`}
                />
              </div>
              <p className="mt-3 text-center text-xs leading-5 text-foreground/58">{bucket.label}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-4 text-sm text-foreground/70">
        {active ? (
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{active.label}</p>
            <p>{active.activityCount} atividade(s)</p>
            <p>{formatDuration(active.durationSeconds)}</p>
            <p>{formatDistance(active.distanceMeters)}</p>
          </div>
        ) : peakLabel ? (
          <p>Pico do período: {peakLabel}.</p>
        ) : (
          <p>Toque em uma barra para ver detalhes.</p>
        )}
      </div>
    </div>
  );
}

function RecentActivityContent({ activity }: { activity: RecentActivity | null }) {
  const trainingEffectAerobic = getNumberFromMetrics(activity?.metrics, "aerobicTrainingEffect");
  const trainingEffectAnaerobic = getNumberFromMetrics(activity?.metrics, "anaerobicTrainingEffect");
  const swolf = getNumberFromMetrics(activity?.metrics, "averageSwolf");

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-5">
        <MetricHeader icon={<IconActivityHeartbeat size={22} />} title="Atividade recente" subtitle={activity ? "Último treino sincronizado" : "Sem treino recente"} colorClass="text-cyan-300" />
        {activity ? (
          <Link href={`/app/atividades/${activity.id}`} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-foreground hover:bg-white/8">
            Ver treino
          </Link>
        ) : null}
      </div>

      {activity ? (
        <div className="mt-5 space-y-5">
          <div>
            <p className="text-2xl font-semibold tracking-tight text-foreground">{humanizeActivityLabel(activity.name) ?? humanizeSport(activity.sportType) ?? "Atividade"}</p>
            <p className="mt-2 text-sm leading-7 text-foreground/60">{formatDateTime(activity.startedAt)}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <CompactMetric label="distância" value={formatDistance(activity.distanceMeters)} />
            <CompactMetric label="duração" value={formatDuration(activity.durationSeconds)} />
            <CompactMetric label="calorias" value={formatCalories(activity.calories)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CompactMetric label="FC média" value={formatHeartRate(activity.averageHeartRate)} />
            <CompactMetric label="FC máxima" value={formatHeartRate(activity.maxHeartRate)} />
            {swolf !== null ? <CompactMetric label="SWOLF" value={String(Math.round(swolf))} /> : null}
            {trainingEffectAerobic !== null ? <CompactMetric label="Efeito aeróbico" value={trainingEffectAerobic.toFixed(1)} /> : null}
            {trainingEffectAnaerobic !== null ? <CompactMetric label="Efeito anaeróbico" value={trainingEffectAnaerobic.toFixed(1)} /> : null}
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-[20px] border border-white/10 bg-black/10 p-5">
          <p className="text-base font-semibold text-foreground">Sem dados disponíveis</p>
          <p className="mt-2 text-sm leading-7 text-foreground/62">Conecte uma integração para começar a visualizar seu último treino aqui.</p>
        </div>
      )}
    </>
  );
}

function TechnicalGroupsContent({ groups, reducedMotion }: { groups: ReturnType<typeof buildTechnicalGroups>; reducedMotion: boolean }) {
  return (
    <>
      <MetricHeader icon={<IconRefresh size={22} />} title="Dados técnicos" subtitle="Informações secundárias do sistema" colorClass="text-foreground/80" />
      <div className="mt-5 space-y-3">
        {groups.map((group) => (
          <details key={group.title} className="group rounded-[18px] border border-white/10 bg-white/5 px-4 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
              <span>{group.title}</span>
              <motion.span animate={reducedMotion ? undefined : { rotate: 0 }} className="transition group-open:rotate-180">
                <IconChevronDown size={16} />
              </motion.span>
            </summary>
            <div className="mt-3 grid gap-2">
              {group.rows.map((row) => (
                <div key={row.label} className="rounded-[16px] bg-black/10 px-3 py-3 text-sm text-foreground/68">
                  <p className="text-xs uppercase tracking-[0.18em] text-foreground/44">{row.label}</p>
                  <p className="mt-1 leading-6">{row.value}</p>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}

function AnimatedNumber({ value, reducedMotion, className }: { value: number; reducedMotion: boolean; className?: string }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    if (reducedMotion) {
      previousValueRef.current = value;
      return;
    }

    let frame = 0;
    const start = performance.now();
    const from = previousValueRef.current;
    const duration = 520;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(from + (value - from) * eased));

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    previousValueRef.current = value;

    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion, value]);

  return <span className={className}>{new Intl.NumberFormat("pt-BR").format(reducedMotion ? value : displayValue)}</span>;
}

function buildHeroSubtitle(props: DashboardRedesignProps) {
  if (!props.activityCount) {
    return `Seu desempenho nos últimos ${props.selectedDays} dias aparece aqui assim que suas atividades começarem a chegar.`;
  }

  if (props.peakWeekLabel && props.peakWeekActivityCount && props.peakWeekDurationSeconds) {
    return `Você completou ${props.activityCount} atividades. Sua semana de maior volume foi ${props.peakWeekLabel}, com ${props.peakWeekActivityCount} atividade(s) e ${formatDuration(props.peakWeekDurationSeconds)} de treino.`;
  }

  return `Você completou ${props.activityCount} atividades nos últimos ${props.selectedDays} dias.`;
}

function getPrimaryInsight(props: DashboardRedesignProps) {
  const readinessScore = props.summary.garminToday?.readiness.score ?? null;

  if (readinessScore !== null) {
    return {
      title: readinessScore < 40 ? "Recuperação" : "Destaque",
      message:
        readinessScore < 40
          ? "Sua prontidão está mais baixa hoje. Considere ajustar a intensidade do treino conforme sua sensação."
          : readinessScore < 70
            ? "Sua prontidão está moderada hoje. Vale equilibrar volume e recuperação antes de intensificar."
            : "Sua prontidão está boa hoje. Se sua sensação acompanhar, o dia favorece um treino de melhor qualidade.",
    };
  }

  if (props.peakWeekLabel && props.peakWeekActivityCount && props.peakWeekDurationSeconds) {
    return {
      title: "Destaque",
      message: `Sua semana de maior volume foi ${props.peakWeekLabel}, com ${props.peakWeekActivityCount} atividade(s) e aproximadamente ${formatDuration(props.peakWeekDurationSeconds)} de treino.`,
    };
  }

  if (props.summary.garminConnection?.status === "RECONNECT_REQUIRED") {
    return {
      title: "Atenção",
      message: "Sua conexão com a Garmin precisa ser refeita para o dashboard voltar a receber dados atualizados.",
    };
  }

  return {
    title: "Destaque",
    message: "Conecte uma integração e mantenha suas sincronizações em dia para acompanhar recuperação, evolução e último treino em um só lugar.",
  };
}

function buildTechnicalGroups(props: DashboardRedesignProps) {
  return [
    {
      title: "Integrações",
      rows: [
        { label: "Garmin", value: getGarminStatusLabel(props.summary.garminConnection?.status) },
        { label: "Última sincronização", value: props.summary.garminConnection?.lastSyncAt ? formatDateTime(props.summary.garminConnection.lastSyncAt) : "Sem sincronização registrada" },
        { label: "WhatsApp", value: props.summary.whatsappIdentity?.verifiedAt ? `Conectado em ${formatDateTime(props.summary.whatsappIdentity.verifiedAt)}` : "Pendente de confirmação" },
      ],
    },
    {
      title: "Recuperação e saúde",
      rows: [
        { label: "HRV da última noite", value: formatHrv(props.summary.garminToday?.hrv.lastNightAvg ?? null) },
        { label: "Sono", value: props.summary.garminToday?.sleep.durationSeconds ? formatDuration(props.summary.garminToday.sleep.durationSeconds) : "Sem dados disponíveis" },
        { label: "Leituras Garmin", value: props.summary.garminToday ? "Snapshot diário disponível" : "Snapshot diário ainda não disponível" },
      ],
    },
    {
      title: "Período selecionado",
      rows: [
        { label: "Janela", value: `Últimos ${props.selectedDays} dias` },
        { label: "Atividades", value: `${props.activityCount} registradas` },
        { label: "Último aviso Garmin", value: props.summary.latestGarminReconnectNotification?.createdAt ? formatDateTime(props.summary.latestGarminReconnectNotification.createdAt) : "Nenhum aviso recente" },
      ],
    },
  ];
}

function getReadinessState(score: number | null) {
  if (score === null) {
    return { label: "Sem dados", ringTone: "rgba(255,255,255,0.5)" };
  }

  if (score < 40) {
    return { label: "Baixa", ringTone: "rgb(251 113 133)" };
  }

  if (score < 70) {
    return { label: "Moderada", ringTone: "rgb(251 191 36)" };
  }

  if (score < 85) {
    return { label: "Boa", ringTone: "rgb(52 211 153)" };
  }

  return { label: "Excelente", ringTone: "rgb(20 184 166)" };
}

function getReadinessFallbackText(label: string) {
  if (label === "Baixa") {
    return "Seu corpo parece pedir mais recuperação hoje.";
  }

  if (label === "Moderada") {
    return "Seu corpo apresenta uma condição razoável para treinar hoje.";
  }

  if (label === "Boa") {
    return "Seu corpo mostra boa resposta para o treino de hoje.";
  }

  if (label === "Excelente") {
    return "Seu corpo está muito bem preparado para treinar hoje.";
  }

  return "Sincronize novamente para atualizar esta métrica.";
}

function getGarminStatusLabel(status: string | null | undefined) {
  if (status === "CONNECTED") {
    return "Conectado";
  }

  if (status === "RECONNECT_REQUIRED") {
    return "Revalidar";
  }

  if (status === "ERROR") {
    return "Com erro";
  }

  if (status === "SYNCING") {
    return "Sincronizando";
  }

  return "Pendente";
}

function translateHrvStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("balanced")) {
    return "Equilibrado";
  }

  if (normalized.includes("low")) {
    return "Baixo";
  }

  if (normalized.includes("unbalanced")) {
    return "Desequilibrado";
  }

  return status ?? null;
}

function humanizeSport(value: string | null | undefined) {
  return humanizeActivityLabel(value);
}

function formatHrv(value: number | null) {
  return value === null ? "Sem dados disponíveis" : `${Math.round(value)} ms`;
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Sem dados disponíveis";
  }

  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function getNumberFromMetrics(metrics: Record<string, unknown> | null | undefined, key: string) {
  const value = metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
