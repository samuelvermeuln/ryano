/**
 * SAM-11 / SAM-20 / SAM-44 — the body of the athlete's analysis, shared by the
 * coach's hub (both scopes) and the school's athlete sheet: weekly volume,
 * trends, time in zone, heart-rate load, evolution per activity, adherence
 * (four outcomes, planned × real volume and frequency) and distribution.
 * Server Component; the caller decides the hrefs.
 */
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import { formatDistance, formatDuration, formatPace, formatSpeed, formatSwimPace } from "@/lib/format";
import { ANALYSIS_WINDOWS, type GetCoachAthleteAnalysis } from "@/modules/school/application/get-coach-athlete-analysis";
import { PRESCRIPTION_OUTCOME_LABELS } from "@/modules/school/presentation/workout-labels";
import { getMetricDisplayCategory, METRIC_DISPLAY_RULES } from "@/modules/shared/activities/metric-display-categories";
import { isRyvanoSportType, resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { ActivityEvolutionCharts } from "./activity-evolution-charts";
import { AthleteAnalysisCharts } from "./athlete-analysis-charts";
import { WithheldNotice } from "./athlete-hub-shell";

export type AnalysisData = Awaited<ReturnType<GetCoachAthleteAnalysis["execute"]>>;

const WINDOW_LABELS: Record<number, string> = {
  28: "4 semanas",
  84: "12 semanas",
  168: "24 semanas",
};

/** "22/09" — short enough that 24 bars still fit on a phone. The week start is a local calendar date. */
function weekLabel(weekStart: string): string {
  const [, month, day] = weekStart.split("-");
  return `${day}/${month}`;
}

/** "+12%" / "−8%" / "igual"; null without a baseline. */
function deltaLabel(current: number, previous: number | null | undefined): string | null {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current > 0 ? "sem base na janela anterior" : null;
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) return "igual à janela anterior";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)}% vs. janela anterior`;
}

const ZONE_LABELS = ["Z1", "Z2", "Z3", "Z4", "Z5"];
const OUTCOME_ORDER = ["EXECUTED_AS_PLANNED", "EXECUTED_PARTIALLY", "EXECUTED_DIFFERENTLY", "PLANNED_NOT_EXECUTED"] as const;
const OUTCOME_BAR: Record<(typeof OUTCOME_ORDER)[number], string> = {
  EXECUTED_AS_PLANNED: "bg-emerald-400/70",
  EXECUTED_PARTIALLY: "bg-amber-400/70",
  EXECUTED_DIFFERENTLY: "bg-orange-400/70",
  PLANNED_NOT_EXECUTED: "bg-rose-400/70",
};

export function AnalysisContent({
  data,
  zoneOwner,
  clampedNotice,
  analysisHref,
  activityHref,
}: {
  data: AnalysisData;
  /** "fuso da escola" | "fuso do atleta". */
  zoneOwner: string;
  clampedNotice: string;
  analysisHref: (options: { windowDays: number; sportType?: string | null }) => string;
  /** Detail of an imported activity for this reader; null when there is no such route. */
  activityHref: ((activityId: string) => string) | null;
}) {
  const { totals, previous, consistency, adherence, adherenceDetail } = data;
  const adherencePercent = adherence.prescribed > 0
    ? Math.round((adherence.done / adherence.prescribed) * 100)
    : null;
  // SAM-20 — time in zone aggregated over the window, only when some session had it.
  const zoneTotals = data.weeks.reduce<number[] | null>((acc, week) => {
    if (!week.zoneSeconds) return acc;
    const base = acc ?? [0, 0, 0, 0, 0];
    return base.map((seconds, index) => seconds + (week.zoneSeconds?.[index] ?? 0));
  }, null);
  const zoneTotal = zoneTotals?.reduce((sum, seconds) => sum + seconds, 0) ?? 0;
  const sportLabels = Object.fromEntries(data.availableSportTypes.map((sport) => [sport, resolveSportLabel(sport) ?? sport]));

  return (
    <>
      <StatTiles
        items={[
          {
            label: "Sessões",
            value: totals.sessions,
            hint: deltaLabel(totals.sessions, previous?.sessions) ?? `Últimas ${WINDOW_LABELS[data.windowDays]}`,
          },
          {
            label: "Tempo total",
            value: formatDuration(totals.durationSeconds),
            hint: deltaLabel(totals.durationSeconds, previous?.durationSeconds) ?? undefined,
          },
          {
            label: "Distância total",
            value: formatDistance(totals.distanceMeters),
            hint: deltaLabel(totals.distanceMeters, previous?.distanceMeters) ?? undefined,
          },
          {
            label: "Semanas ativas",
            value: `${consistency.activeWeeks}/${consistency.totalWeeks}`,
            hint: "Com ao menos uma sessão",
          },
        ]}
      />

      {data.clampedToPeriod && <WithheldNotice>{clampedNotice}</WithheldNotice>}

      <SectionCard
        title="Volume por semana"
        description={`Tudo o que o atleta fez — prescrito ou não — em semanas de segunda a domingo no ${zoneOwner} (${data.timeZone.replace(/_/g, " ")}).`}
        action={
          <nav aria-label="Janela de análise" className="flex flex-wrap gap-2">
            {ANALYSIS_WINDOWS.map((option) => {
              const isActive = option === data.windowDays;
              return (
                <Link
                  key={option}
                  href={analysisHref({ windowDays: option, sportType: data.sportType })}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    isActive
                      ? "theme-pill-info font-medium"
                      : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10 hover:text-foreground"
                  }`}
                >
                  {WINDOW_LABELS[option]}
                </Link>
              );
            })}
          </nav>
        }
      >
        {data.availableSportTypes.length > 1 && (
          <nav aria-label="Filtrar análise por modalidade" className="mb-4 overflow-x-auto">
            <ul className="flex min-w-max gap-2">
              <li>
                <Link
                  href={analysisHref({ windowDays: data.windowDays, sportType: null })}
                  aria-current={data.sportType === null ? "page" : undefined}
                  className={`block rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    data.sportType === null
                      ? "theme-pill-neutral font-medium"
                      : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10"
                  }`}
                >
                  Todas as modalidades
                </Link>
              </li>
              {data.availableSportTypes.map((sport) => (
                <li key={sport}>
                  <Link
                    href={analysisHref({ windowDays: data.windowDays, sportType: sport })}
                    aria-current={data.sportType === sport ? "page" : undefined}
                    className={`block rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      data.sportType === sport
                        ? "theme-pill-neutral font-medium"
                        : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10"
                    }`}
                  >
                    {resolveSportLabel(sport)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {totals.sessions === 0 ? (
          <EmptyState
            title="Sem sessões nesta janela"
            description="Quando este atleta registrar treinos ou importar atividades no período escolhido, os gráficos aparecem aqui."
          />
        ) : (
          <AthleteAnalysisCharts
            heartRateLoadAvailable={data.heartRateLoadAvailable}
            weeks={data.weeks.map((week) => ({
              label: weekLabel(week.weekStart),
              prescribed: week.prescribed,
              unprescribed: week.unprescribed,
              sessions: week.total.sessions,
              durationSeconds: week.total.durationSeconds,
              distanceMeters: week.total.distanceMeters,
              averageHeartRate: week.averageHeartRate,
              heartRateLoad: week.heartRateLoad,
            }))}
          />
        )}
      </SectionCard>

      {/* SAM-44 — one point per session; natação traz ritmo /100 m, braçadas, distância por braçada e SWOLF quando houver. */}
      {totals.sessions > 0 && (
        <SectionCard
          title="Evolução por atividade"
          description="Cada sessão da janela como um ponto, por modalidade — filtre uma modalidade para comparar piscina e alto mar, e a janela para ver antes e depois de uma mudança. Clique no ponto para abrir a atividade."
        >
          <ActivityEvolutionCharts points={data.activities} sportLabels={sportLabels} activityHref={activityHref} />
        </SectionCard>
      )}

      {/* SAM-20 — trends and time in zone, only with data behind them. */}
      {totals.sessions > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            title="Ritmo e FC por modalidade"
            description="Velocidade média ponderada pela distância e FC média ponderada pelo tempo, na janela."
          >
            <ul className="space-y-2" data-testid="sport-trends">
              {data.bySport.map((slice) => {
                const category = isRyvanoSportType(slice.sportType) ? getMetricDisplayCategory(slice.sportType) : "default";
                const rules = METRIC_DISPLAY_RULES[category];
                const paceLabel = slice.averageSpeed === null
                  ? null
                  : rules.pace === "pace-per-100m"
                    ? formatSwimPace(100 / slice.averageSpeed)
                    : rules.pace === "pace-per-km"
                      ? formatPace(1000 / slice.averageSpeed)
                      : formatSpeed(slice.averageSpeed * 3.6);
                return (
                  <li key={slice.sportType} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm">
                    <span className="font-medium">{resolveSportLabel(slice.sportType) ?? slice.sportType}</span>
                    <span className="flex flex-wrap gap-x-3 text-xs tabular-nums text-foreground/70">
                      <span>{slice.sessions} sessão(ões)</span>
                      {paceLabel && <span>{paceLabel}</span>}
                      {slice.averageHeartRate !== null && <span>{slice.averageHeartRate} bpm</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
            {previous && previous.averageHeartRate !== null && totals.averageHeartRate !== null && (
              <p className="mt-3 text-xs text-foreground/50">
                FC média da janela: {totals.averageHeartRate} bpm (janela anterior: {previous.averageHeartRate} bpm).
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="Tempo em zonas de FC"
            description="Soma dos tempos em zona enviados pelo provedor (zonas do dispositivo) nas sessões da janela."
          >
            {!zoneTotals ? (
              <p className="text-sm text-foreground/50">Nenhuma sessão desta janela trouxe tempo em zona.</p>
            ) : (
              <ul className="space-y-2" data-testid="zone-totals">
                {zoneTotals.map((seconds, index) => (
                  <li key={ZONE_LABELS[index]} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground/80">{ZONE_LABELS[index]}</span>
                      <span className="tabular-nums text-foreground/60">
                        {formatDuration(seconds)} · {zoneTotal > 0 ? Math.round((seconds / zoneTotal) * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/8" aria-hidden="true">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${zoneTotal > 0 ? Math.max((seconds / zoneTotal) * 100, 1) : 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}

      {data.heartRateLoadAvailable && totals.heartRateLoad !== null && (
        <SectionCard
          title="Carga por FC (hrTSS)"
          description="Estimativa de carga a partir da FC média de cada sessão e dos limiares da ficha (ADR-007): uma hora na FC de limiar = 100."
        >
          <p className="text-2xl font-semibold tabular-nums" data-testid="hr-load-total">
            {totals.heartRateLoad}
            <span className="ml-2 text-sm font-normal text-foreground/55">
              na janela{previous?.heartRateLoad !== null && previous?.heartRateLoad !== undefined ? ` · anterior: ${previous.heartRateLoad}` : ""}
            </span>
          </p>
          <p className="mt-2 text-xs text-foreground/45">
            hrTSS = horas × IF², IF = %reserva(FC média) ÷ %reserva(FC de limiar). Sem CTL/ATL/TSB: a série é curta demais para um modelo de forma.
          </p>
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Aderência" description="Prescrito × executado na janela: conforme, parcial, diferente ou não executado; volume e frequência planejados × reais.">
          {adherenceDetail.counted === 0 ? (
            <p className="text-sm text-foreground/50" data-testid="adherence-detail-empty">Nenhuma prescrição agendada nesta janela.</p>
          ) : (
            <ul className="space-y-2" data-testid="adherence-detail">
              {OUTCOME_ORDER.map((outcome) => {
                const count = adherenceDetail.byOutcome[outcome];
                const share = Math.round((count / adherenceDetail.counted) * 100);
                return (
                  <li key={outcome} className="space-y-1" data-outcome={outcome}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground/80">{PRESCRIPTION_OUTCOME_LABELS[outcome]}</span>
                      <span className="tabular-nums text-foreground/60">{count} · {share}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
                      <div className={`h-full rounded-full ${OUTCOME_BAR[outcome]}`} style={{ width: `${Math.max(share, count > 0 ? 2 : 0)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <dl className="mt-4 space-y-2 text-sm" data-testid="adherence-volume">
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/60">Volume planejado × realizado</dt>
              <dd className="font-semibold tabular-nums">
                {adherenceDetail.plannedDurationSeconds !== null ? formatDuration(adherenceDetail.plannedDurationSeconds) : "—"}
                {" × "}
                {formatDuration(adherenceDetail.executedDurationSeconds)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/60">Sessões por semana (planejadas × reais)</dt>
              <dd className="font-semibold tabular-nums">{adherenceDetail.plannedPerWeek} × {adherenceDetail.executedPerWeek}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/60">Cumpridos</dt>
              <dd className="font-semibold tabular-nums">
                {adherence.done}/{adherence.prescribed}
                {adherencePercent !== null && (
                  <span className="ml-1 text-xs font-normal text-foreground/50">({adherencePercent}%)</span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/60">Nota média de aderência</dt>
              <dd className="font-semibold tabular-nums">
                {adherence.averageComplianceScore !== null
                  ? `${(adherence.averageComplianceScore / 10).toFixed(1)}/10`
                  : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-foreground/45">
            {adherence.scoredCount > 0
              ? `Média de ${adherence.scoredCount} execução(ões) com aderência calculada.`
              : "Nenhuma execução desta janela teve aderência calculada ainda."}
          </p>
        </SectionCard>

        <SectionCard title="Distribuição por modalidade" description="Tempo executado em cada modalidade.">
          {data.bySport.length === 0 ? (
            <EmptyState
              title="Sem distribuição"
              description="Nenhuma execução registrada nesta janela."
            />
          ) : (
            <ul className="space-y-3">
              {data.bySport.map((slice) => {
                const share = totals.durationSeconds > 0
                  ? Math.round((slice.durationSeconds / totals.durationSeconds) * 100)
                  : 0;
                return (
                  <li key={slice.sportType} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-foreground/80">
                        {resolveSportLabel(slice.sportType)}
                      </span>
                      <span className="text-xs tabular-nums text-foreground/55">
                        {formatDuration(slice.durationSeconds)} · {share}%
                      </span>
                    </div>
                    <div
                      role="img"
                      aria-label={`${resolveSportLabel(slice.sportType)}: ${share}% do tempo`}
                      className="h-2.5 overflow-hidden rounded-full bg-white/10"
                    >
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(share, 2)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <p className="text-xs leading-6 text-foreground/45">
        Esta análise usa volume, consistência, tendências, evolução por atividade e aderência — todos agregados de dados já registrados.
        {data.heartRateLoadAvailable
          ? " A carga por FC é uma estimativa (hrTSS) e depende dos limiares da ficha técnica."
          : " A carga por FC (hrTSS) aparece quando a ficha técnica tiver FC de repouso, de limiar e máxima."}
        {" "}Métricas de forma do tipo CTL/ATL/TSB não são exibidas: a série é curta demais para um modelo
        de carga crônica/aguda.
      </p>
    </>
  );
}
