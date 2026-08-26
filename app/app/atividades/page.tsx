import type { Prisma } from "@prisma/client";
import { WearableProvider } from "@prisma/client";

import { ActivitiesBrowser } from "@/components/activities/activities-browser";
import { humanizeActivityLabel } from "@/lib/activity-text";
import {
  formatCalories,
  formatDistance,
  formatDuration,
  formatDurationClock,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatPower,
  formatSpeed,
  formatSwimPace,
} from "@/lib/format";
import { requireOnboardedUser } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const PERIOD_OPTIONS = [7, 30, 90, 365] as const;
const SORT_OPTIONS = ["recent", "oldest", "distance", "duration"] as const;
const SMALL_WORDS = new Set(["a", "as", "ao", "aos", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os", "para", "por"]);

const activityListSelect = {
  id: true,
  name: true,
  provider: true,
  sportType: true,
  startedAt: true,
  durationSeconds: true,
  distanceMeters: true,
  calories: true,
  averageHeartRate: true,
  maxHeartRate: true,
  averagePace: true,
  averageSpeed: true,
  elevationGain: true,
  averageCadence: true,
  averagePower: true,
} satisfies Prisma.ActivitySelect;

type ActivityRow = Prisma.ActivityGetPayload<{ select: typeof activityListSelect }>;
type SortOption = (typeof SORT_OPTIONS)[number];
type PeriodOption = (typeof PERIOD_OPTIONS)[number];
type SportTone = "swim" | "bike" | "run" | "triathlon" | "walking" | "strength" | "default";

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    provider?: string;
    sportType?: string;
    days?: string;
    page?: string;
    q?: string;
    sort?: string;
  }>;
}) {
  const user = await requireOnboardedUser();
  const params = normalizeSearchParams(await searchParams);
  const now = new Date();
  const startedAfter = new Date(now);
  startedAfter.setDate(startedAfter.getDate() - params.days);

  const providerFilter = params.provider && Object.values(WearableProvider).includes(params.provider as WearableProvider)
    ? (params.provider as WearableProvider)
    : undefined;

  const baseWhere: Prisma.ActivityWhereInput = {
    userId: user.id,
    provider: providerFilter,
    sportType: params.sportType || undefined,
    startedAt: {
      gte: startedAfter,
    },
  };

  const previousStart = new Date(startedAfter);
  previousStart.setDate(previousStart.getDate() - params.days);

  const previousWhere: Prisma.ActivityWhereInput = {
    userId: user.id,
    provider: providerFilter,
    sportType: params.sportType || undefined,
    startedAt: {
      gte: previousStart,
      lt: startedAfter,
    },
  };

  const [allActivities, previousPeriodActivities, sportTypeRows, providerRows, userActivityCount] = await Promise.all([
    prisma.activity.findMany({
      where: baseWhere,
      select: activityListSelect,
    }),
    params.query
      ? Promise.resolve<ActivityRow[]>([])
      : prisma.activity.findMany({
          where: previousWhere,
          select: activityListSelect,
        }),
    prisma.activity.findMany({
      where: { userId: user.id },
      distinct: ["sportType"],
      select: { sportType: true },
      orderBy: { sportType: "asc" },
    }),
    prisma.activity.findMany({
      where: { userId: user.id },
      distinct: ["provider"],
      select: { provider: true },
      orderBy: { provider: "asc" },
    }),
    prisma.activity.count({ where: { userId: user.id } }),
  ]);

  const searchedActivities = params.query
    ? allActivities.filter((activity) => matchesSearch(activity, params.query))
    : allActivities;
  const sortedActivities = searchedActivities.toSorted((left, right) => compareActivities(left, right, params.sort));
  const totalItems = sortedActivities.length;
  const totalPages = totalItems ? Math.ceil(totalItems / PAGE_SIZE) : 1;
  const currentPage = Math.min(params.page, totalPages);
  const currentPageItems = sortedActivities.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const highlightIds = getHighlightIds(sortedActivities);

  const sportOptions = sportTypeRows
    .map((row) => ({
      value: row.sportType,
      label: humanizeActivityLabel(row.sportType) ?? row.sportType,
    }))
    .toSorted((left, right) => left.label.localeCompare(right.label, "pt-BR"));

  const providerOptions = providerRows.map((row) => ({
    value: row.provider,
    label: getProviderLabel(row.provider),
  }));

  const groups = buildActivityGroups(
    currentPageItems.map((activity) => buildActivityCard(activity, highlightIds, params, currentPage)),
    params.days,
    now,
  );

  const summaryCards = buildSummaryCards(searchedActivities, previousPeriodActivities, params.days, Boolean(params.query));
  const headerResultLabel = buildHeaderResultLabel(totalItems, params.days, params.query);
  const emptyState = totalItems
    ? null
    : userActivityCount
      ? {
          kind: "filters" as const,
          title: "Nenhuma atividade encontrada",
          description: "Não encontramos treinos com esses filtros. Tente ampliar o período ou remover algum filtro.",
          actionLabel: "Limpar filtros",
        }
      : {
          kind: "account" as const,
          title: "Seu histórico começa no próximo treino",
          description: "Conecte um dispositivo compatível e suas atividades aparecerão automaticamente aqui.",
          actionLabel: "Gerenciar integrações",
          actionHref: "/app/integracoes",
        };

  return (
    <ActivitiesBrowser
      header={{
        eyebrow: "Seu histórico",
        title: "Atividades",
        description: "Reveja seus treinos, acompanhe seu volume e encontre rapidamente cada atividade sincronizada.",
        resultLabel: headerResultLabel,
      }}
      filters={{
        days: params.days,
        provider: providerFilter ?? "",
        sportType: params.sportType,
        query: params.query,
        sort: params.sort,
      }}
      options={{
        periods: [
          { value: 7, shortLabel: "7 dias", fullLabel: "Últimos 7 dias" },
          { value: 30, shortLabel: "30 dias", fullLabel: "Últimos 30 dias" },
          { value: 90, shortLabel: "90 dias", fullLabel: "Últimos 90 dias" },
          { value: 365, shortLabel: "1 ano", fullLabel: "Último ano" },
        ],
        providers: providerOptions,
        sports: sportOptions,
        sorts: [
          { value: "recent", label: "Mais recentes" },
          { value: "oldest", label: "Mais antigas" },
          { value: "distance", label: "Maior distância" },
          { value: "duration", label: "Maior duração" },
        ],
      }}
      summaryCards={summaryCards}
      groups={groups}
      pagination={{
        page: currentPage,
        totalPages,
        totalItems,
        pageStart: totalItems ? (currentPage - 1) * PAGE_SIZE + 1 : 0,
        pageEnd: totalItems ? Math.min(currentPage * PAGE_SIZE, totalItems) : 0,
      }}
      emptyState={emptyState}
    />
  );
}

function normalizeSearchParams(params: {
  provider?: string;
  sportType?: string;
  days?: string;
  page?: string;
  q?: string;
  sort?: string;
}) {
  const daysValue = Number(params.days ?? "30");
  const days = PERIOD_OPTIONS.includes(daysValue as PeriodOption) ? (daysValue as PeriodOption) : 30;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const sort = SORT_OPTIONS.includes((params.sort ?? "recent") as SortOption)
    ? ((params.sort ?? "recent") as SortOption)
    : "recent";

  return {
    provider: params.provider?.trim() ?? "",
    sportType: params.sportType?.trim() ?? "",
    days,
    page,
    query: params.q?.trim() ?? "",
    sort,
  };
}

function compareActivities(left: ActivityRow, right: ActivityRow, sort: SortOption) {
  if (sort === "oldest") {
    return left.startedAt.getTime() - right.startedAt.getTime();
  }

  if (sort === "distance") {
    return compareNullableNumberDesc(left.distanceMeters, right.distanceMeters) || right.startedAt.getTime() - left.startedAt.getTime();
  }

  if (sort === "duration") {
    return compareNullableNumberDesc(left.durationSeconds, right.durationSeconds) || right.startedAt.getTime() - left.startedAt.getTime();
  }

  return right.startedAt.getTime() - left.startedAt.getTime();
}

function compareNullableNumberDesc(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return right - left;
}

function matchesSearch(activity: ActivityRow, query: string) {
  const haystack = normalizeText([
    resolveActivityTitle(activity.name, activity.sportType),
    humanizeActivityLabel(activity.sportType) ?? activity.sportType,
    getProviderLabel(activity.provider),
  ].join(" "));

  return haystack.includes(normalizeText(query));
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSummaryCards(current: ActivityRow[], previous: ActivityRow[], days: PeriodOption, hideComparison: boolean) {
  const currentTotals = aggregateActivities(current);
  const previousTotals = aggregateActivities(previous);
  const subtitle = getPeriodSubtitle(days);

  return [
    {
      key: "activities",
      icon: "activity" as const,
      value: String(currentTotals.count),
      label: "Atividades",
      subtitle,
      comparison: hideComparison ? null : formatCountComparison(currentTotals.count - previousTotals.count),
    },
    {
      key: "distance",
      icon: "route" as const,
      value: formatDistance(currentTotals.distanceMeters),
      label: "Distância total",
      subtitle,
      comparison: hideComparison ? null : formatDistanceComparison(currentTotals.distanceMeters - previousTotals.distanceMeters, previousTotals.distanceMeters),
    },
    {
      key: "duration",
      icon: "clock" as const,
      value: formatDuration(currentTotals.durationSeconds),
      label: "Tempo em atividade",
      subtitle,
      comparison: hideComparison ? null : formatDurationComparison(currentTotals.durationSeconds - previousTotals.durationSeconds, previousTotals.durationSeconds),
    },
    {
      key: "active-days",
      icon: "calendar" as const,
      value: `${currentTotals.activeDays} ${currentTotals.activeDays === 1 ? "dia" : "dias"}`,
      label: "Dias com treino",
      subtitle,
      comparison: hideComparison ? null : formatActiveDaysComparison(currentTotals.activeDays - previousTotals.activeDays, previousTotals.activeDays),
    },
  ];
}

function aggregateActivities(activities: ActivityRow[]) {
  const activeDayKeys = new Set<string>();

  return activities.reduce(
    (totals, activity) => {
      totals.count += 1;
      totals.distanceMeters += activity.distanceMeters ?? 0;
      totals.durationSeconds += activity.durationSeconds ?? 0;
      activeDayKeys.add(toDayKey(activity.startedAt));
      totals.activeDays = activeDayKeys.size;
      return totals;
    },
    {
      count: 0,
      distanceMeters: 0,
      durationSeconds: 0,
      activeDays: 0,
    },
  );
}

function getPeriodSubtitle(days: PeriodOption) {
  if (days === 365) {
    return "no último ano";
  }

  return `nos últimos ${days} dias`;
}

function formatCountComparison(diff: number) {
  if (!diff) {
    return null;
  }

  return `${diff > 0 ? "+" : ""}${diff} ${Math.abs(diff) === 1 ? "treino" : "treinos"} vs. período anterior`;
}

function formatDistanceComparison(diff: number, previousTotal: number) {
  if (!previousTotal || !diff) {
    return null;
  }

  return `${diff > 0 ? "+" : "−"}${formatDistance(Math.abs(diff))} vs. período anterior`;
}

function formatDurationComparison(diff: number, previousTotal: number) {
  if (!previousTotal || !diff) {
    return null;
  }

  return `${diff > 0 ? "+" : "−"}${formatDuration(Math.abs(diff))} vs. período anterior`;
}

function formatActiveDaysComparison(diff: number, previousTotal: number) {
  if (!previousTotal || !diff) {
    return null;
  }

  return `${diff > 0 ? "+" : ""}${diff} ${Math.abs(diff) === 1 ? "dia" : "dias"} vs. período anterior`;
}

function buildHeaderResultLabel(totalItems: number, days: PeriodOption, query: string) {
  if (!totalItems) {
    return query ? "Nenhum treino encontrado" : `Nenhuma atividade ${getPeriodSubtitle(days)}`;
  }

  if (query) {
    return `${totalItems} ${totalItems === 1 ? "resultado" : "resultados"} para “${query}”`;
  }

  return `${totalItems} ${totalItems === 1 ? "atividade" : "atividades"} ${getPeriodSubtitle(days)}`;
}

function getHighlightIds(activities: ActivityRow[]) {
  const maxDistanceId = activities
    .filter((activity) => activity.distanceMeters !== null)
    .toSorted((left, right) => compareNullableNumberDesc(left.distanceMeters, right.distanceMeters))[0]?.id;
  const maxDurationId = activities
    .filter((activity) => activity.durationSeconds !== null)
    .toSorted((left, right) => compareNullableNumberDesc(left.durationSeconds, right.durationSeconds))[0]?.id;

  return {
    mostRecentId: activities[0]?.id,
    maxDistanceId,
    maxDurationId,
  };
}

function buildActivityCard(
  activity: ActivityRow,
  highlights: ReturnType<typeof getHighlightIds>,
  params: ReturnType<typeof normalizeSearchParams>,
  currentPage: number,
) {
  const sportTone = resolveSportTone(activity.sportType);
  const title = resolveActivityTitle(activity.name, activity.sportType);
  const meta = `${formatActivityDate(activity.startedAt)} · ${formatActivityTime(activity.startedAt)} · ${getProviderLabel(activity.provider)}`;
  const badges = buildActivityBadges(activity, sportTone, highlights, params, currentPage);
  const facts = buildActivityFacts(activity, sportTone);

  return {
    id: activity.id,
    href: `/app/atividades/${activity.id}`,
    startedAt: activity.startedAt.toISOString(),
    title,
    meta,
    sportTone,
    metrics: buildActivityMetrics(activity, sportTone),
    badges,
    facts,
  };
}

function buildActivityMetrics(activity: ActivityRow, sportTone: SportTone) {
  const distanceMetric = { label: "Distância", value: formatDistance(activity.distanceMeters) };
  const durationMetric = { label: "Duração", value: formatDurationClock(activity.durationSeconds) };
  const heartRateMetric = { label: "FC média", value: formatHeartRate(activity.averageHeartRate) };
  const caloriesMetric = { label: "Calorias", value: formatCalories(activity.calories) };
  const elevationMetric = { label: "Elevação", value: formatElevation(activity.elevationGain) };
  const cadenceMetric = { label: "Cadência", value: activity.averageCadence ? `${Math.round(activity.averageCadence)} rpm` : "—" };
  const powerMetric = { label: "Potência média", value: formatPower(activity.averagePower) };

  if (sportTone === "swim") {
    return [
      distanceMetric,
      durationMetric,
      { label: "Ritmo médio", value: formatSwimPace(activity.averagePace) },
      pickMetric([heartRateMetric, caloriesMetric]),
    ];
  }

  if (sportTone === "run") {
    return [
      distanceMetric,
      durationMetric,
      { label: "Pace médio", value: formatPace(activity.averagePace) },
      pickMetric([heartRateMetric, cadenceMetric, elevationMetric]),
    ];
  }

  if (sportTone === "bike") {
    return [
      distanceMetric,
      durationMetric,
      { label: "Velocidade média", value: formatSpeed(activity.averageSpeed ? activity.averageSpeed * 3.6 : null) },
      pickMetric([powerMetric, heartRateMetric, elevationMetric]),
    ];
  }

  if (sportTone === "walking") {
    return [
      distanceMetric,
      durationMetric,
      pickMetric([
        { label: "Pace médio", value: formatPace(activity.averagePace) },
        { label: "Velocidade média", value: formatSpeed(activity.averageSpeed ? activity.averageSpeed * 3.6 : null) },
      ]),
      pickMetric([heartRateMetric, caloriesMetric]),
    ];
  }

  if (sportTone === "strength") {
    return [
      durationMetric,
      pickMetric([caloriesMetric, heartRateMetric]),
      heartRateMetric,
      pickMetric([distanceMetric, elevationMetric]),
    ];
  }

  return [
    durationMetric,
    distanceMetric,
    pickMetric([heartRateMetric, caloriesMetric]),
    pickMetric([elevationMetric, caloriesMetric]),
  ];
}

function pickMetric(metrics: Array<{ label: string; value: string }>) {
  return metrics.find((metric) => metric.value !== "—") ?? metrics[0];
}

function buildActivityBadges(
  activity: ActivityRow,
  sportTone: SportTone,
  highlights: ReturnType<typeof getHighlightIds>,
  params: ReturnType<typeof normalizeSearchParams>,
  currentPage: number,
) {
  const badges: Array<{
    label: string;
    tone: "neutral" | "info" | "warning" | "success";
    icon: "trophy" | "warning" | "recent";
  }> = [];

  if (hasSuspiciousData(activity, sportTone)) {
    badges.push({
      label: "Dados incompletos",
      tone: "warning",
      icon: "warning",
    });
  }

  if (activity.id === highlights.maxDistanceId && activity.distanceMeters && activity.distanceMeters > 0) {
    badges.push({
      label: "Maior distância",
      tone: "success",
      icon: "trophy",
    });
  } else if (activity.id === highlights.maxDurationId && activity.durationSeconds && activity.durationSeconds > 0) {
    badges.push({
      label: "Maior duração",
      tone: "success",
      icon: "trophy",
    });
  }

  if (currentPage === 1 && params.sort === "recent" && activity.id === highlights.mostRecentId) {
    badges.push({
      label: "Mais recente",
      tone: "info",
      icon: "recent",
    });
  }

  return badges.slice(0, 2);
}

function buildActivityFacts(activity: ActivityRow, sportTone: SportTone) {
  const facts: string[] = [];

  const push = (value: string) => {
    if (value !== "—" && !facts.includes(value) && facts.length < 2) {
      facts.push(value);
    }
  };

  push(formatCalories(activity.calories));

  if (sportTone === "run") {
    push(activity.averageCadence ? `Cadência ${Math.round(activity.averageCadence)} rpm` : "—");
    push(activity.elevationGain ? `Elevação ${formatElevation(activity.elevationGain)}` : "—");
    return facts;
  }

  if (sportTone === "bike") {
    push(activity.averagePower ? `Potência ${formatPower(activity.averagePower)}` : "—");
    push(activity.elevationGain ? `Elevação ${formatElevation(activity.elevationGain)}` : "—");
    return facts;
  }

  if (sportTone === "swim") {
    push(activity.averageHeartRate ? `FC ${formatHeartRate(activity.averageHeartRate)}` : "—");
    return facts;
  }

  push(activity.elevationGain ? `Elevação ${formatElevation(activity.elevationGain)}` : "—");
  return facts;
}

function hasSuspiciousData(activity: ActivityRow, sportTone: SportTone) {
  if (!["swim", "bike", "run", "walking"].includes(sportTone)) {
    return false;
  }

  return !activity.distanceMeters && (activity.durationSeconds ?? 0) >= 20 * 60;
}

function resolveSportTone(sportType: string): SportTone {
  const normalized = normalizeText(sportType);

  if (normalized.includes("swim") || normalized.includes("natacao") || normalized.includes("natac") || normalized.includes("pool") || normalized.includes("aguas abertas")) {
    return "swim";
  }

  if (normalized.includes("bike") || normalized.includes("cycling") || normalized.includes("cicl") || normalized.includes("ride")) {
    return "bike";
  }

  if (normalized.includes("run") || normalized.includes("corr") || normalized.includes("treadmill")) {
    return "run";
  }

  if (normalized.includes("tri") || normalized.includes("multisport") || normalized.includes("aquathlon")) {
    return "triathlon";
  }

  if (normalized.includes("walk") || normalized.includes("caminh") || normalized.includes("hiking")) {
    return "walking";
  }

  if (normalized.includes("strength") || normalized.includes("muscul") || normalized.includes("forca") || normalized.includes("cardio") || normalized.includes("hiit")) {
    return "strength";
  }

  return "default";
}

function resolveActivityTitle(name: string | null, sportType: string) {
  const fallback = humanizeActivityLabel(sportType) ?? "Atividade";

  if (!name?.trim()) {
    return fallback;
  }

  const trimmedName = name.trim().replace(/\s+/g, " ");
  const normalizedFallback = normalizeText(fallback);
  const normalizedName = normalizeText(trimmedName);
  const normalizedHumanized = normalizeText(humanizeActivityLabel(trimmedName) ?? trimmedName);

  if (normalizedName === normalizedFallback || normalizedHumanized === normalizedFallback) {
    return fallback;
  }

  if (hasInconsistentCasing(trimmedName)) {
    return toPresentationTitle(trimmedName);
  }

  return trimmedName;
}

function hasInconsistentCasing(value: string) {
  return /\p{Ll}\p{Lu}/u.test(value) || /\p{Lu}{2,}\p{Ll}/u.test(value);
}

function toPresentationTitle(value: string) {
  const lower = value.toLocaleLowerCase("pt-BR");
  const words = lower.split(/(\s+|[-–—])/);

  return words
    .map((word, index) => {
      if (!/\p{L}/u.test(word)) {
        return word;
      }

      if (SMALL_WORDS.has(word) && index !== 0 && index !== words.length - 1) {
        return word;
      }

      return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
    })
    .join("");
}

function formatActivityDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
  })
    .format(date)
    .replace(".", "");
}

function formatActivityTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildActivityGroups(
  activities: Array<ReturnType<typeof buildActivityCard>>,
  days: PeriodOption,
  now: Date,
) {
  const groups: Array<{
    label: string;
    items: Array<ReturnType<typeof buildActivityCard>>;
  }> = [];

  for (const activity of activities) {
    const label = getGroupLabel(new Date(activity.startedAt), days, now);
    const existing = groups.find((group) => group.label === label);

    if (existing) {
      existing.items.push(activity);
      continue;
    }

    groups.push({
      label,
      items: [activity],
    });
  }

  return groups;
}

function getGroupLabel(startedAt: Date, days: PeriodOption, now: Date) {
  if (days >= 90) {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    })
      .format(startedAt)
      .toLocaleUpperCase("pt-BR");
  }

  if (isSameDay(startedAt, now)) {
    return "Hoje";
  }

  const currentWeekStart = startOfWeek(now);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  if (startedAt >= currentWeekStart) {
    return "Esta semana";
  }

  if (startedAt >= previousWeekStart) {
    return "Semana passada";
  }

  return "Anteriores";
}

function isSameDay(left: Date, right: Date) {
  return toDayKey(left) === toDayKey(right);
}

function toDayKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function startOfWeek(date: Date) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + diff);
  return value;
}

function getProviderLabel(provider: WearableProvider) {
  switch (provider) {
    case WearableProvider.GARMIN:
      return "Garmin";
    case WearableProvider.APPLE:
      return "Apple Health";
    case WearableProvider.POLAR:
      return "Polar";
    case WearableProvider.COROS:
      return "COROS";
    case WearableProvider.SUUNTO:
      return "Suunto";
    case WearableProvider.FITBIT:
      return "Fitbit";
    default:
      return provider;
  }
}
