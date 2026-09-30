/**
 * SAM-11 — Análise do atleta (visão do professor).
 *
 * Weekly volume, consistency, modality distribution and adherence over a window
 * chosen in the URL.
 *
 * Every number is an aggregate of data that already exists — executions,
 * prescriptions and the stored `WorkoutCompliance` scores. There is deliberately
 * no training-load model (CTL/ATL/TSB): that needs per-second streams or a
 * documented TSS-equivalent and the product stores neither, so the gap is stated
 * on the screen instead of filled with a number the coach cannot act on.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import { formatDistance, formatDuration } from "@/lib/format";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import {
  ANALYSIS_WINDOWS,
  GetCoachAthleteAnalysis,
} from "@/modules/school/application/get-coach-athlete-analysis";
import { SchoolError } from "@/modules/school/domain/errors";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell, athleteHubHref, WithheldNotice } from "../athlete-hub-shell";
import { AthleteAnalysisCharts } from "./athlete-analysis-charts";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string }>;
  searchParams: Promise<{ janela?: string; modalidade?: string }>;
};

const analysis = new GetCoachAthleteAnalysis(prisma);

const WINDOW_LABELS: Record<number, string> = {
  28: "4 semanas",
  84: "12 semanas",
  168: "24 semanas",
};

function analysisHref(
  schoolId: string,
  athleteId: string,
  options: { windowDays: number; sportType?: string | null },
): string {
  const query = new URLSearchParams();
  if (options.windowDays !== 84) query.set("janela", String(options.windowDays));
  if (options.sportType) query.set("modalidade", options.sportType);
  const suffix = query.toString();
  return `${athleteHubHref(schoolId, athleteId, "analise")}${suffix ? `?${suffix}` : ""}`;
}

/** "22/09" — short enough that 24 bars still fit on a phone. */
function weekLabel(weekStart: Date): string {
  return weekStart.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
}

export default async function AthleteAnalysisPage({ params, searchParams }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, athleteId } = await params;
  const query = await searchParams;

  let data: Awaited<ReturnType<typeof analysis.execute>>;
  try {
    data = await analysis.execute(session.user.id, schoolId, athleteId, {
      ...(query.janela ? { windowDays: query.janela } : {}),
      ...(query.modalidade ? { sportType: query.modalidade } : {}),
    });
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { context, totals, consistency, adherence } = data;
  const adherencePercent = adherence.prescribed > 0
    ? Math.round((adherence.done / adherence.prescribed) * 100)
    : null;

  return (
    <AthleteHubShell
      schoolId={schoolId}
      athlete={context.athlete}
      teams={context.teams}
      currentCoach={context.currentCoach}
      isResponsibleCoach={context.isResponsibleCoach}
      active="analise"
    >
      <StatTiles
        items={[
          { label: "Sessões", value: totals.sessions, hint: `Últimas ${WINDOW_LABELS[data.windowDays]}` },
          { label: "Tempo total", value: formatDuration(totals.durationSeconds) },
          { label: "Distância total", value: formatDistance(totals.distanceMeters) },
          {
            label: "Semanas ativas",
            value: `${consistency.activeWeeks}/${consistency.totalWeeks}`,
            hint: "Com ao menos uma sessão",
          },
        ]}
      />

      {data.clampedToPeriod && (
        <WithheldNotice>
          A janela foi encurtada até o início do vínculo atual deste atleta com a escola: dados de uma
          passagem anterior dependem de autorização do próprio atleta.
        </WithheldNotice>
      )}

      <SectionCard
        title="Volume por semana"
        description="Somente execuções associadas às prescrições — um treino não feito não conta como volume."
        action={
          <nav aria-label="Janela de análise" className="flex flex-wrap gap-2">
            {ANALYSIS_WINDOWS.map((option) => {
              const isActive = option === data.windowDays;
              return (
                <Link
                  key={option}
                  href={analysisHref(schoolId, athleteId, {
                    windowDays: option,
                    sportType: data.sportType,
                  })}
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
                  href={analysisHref(schoolId, athleteId, { windowDays: data.windowDays, sportType: null })}
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
                    href={analysisHref(schoolId, athleteId, {
                      windowDays: data.windowDays,
                      sportType: sport,
                    })}
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
            title="Sem execuções nesta janela"
            description="Quando este atleta registrar treinos no período escolhido, os gráficos aparecem aqui."
          />
        ) : (
          <AthleteAnalysisCharts
            weeks={data.weeks.map((week) => ({
              label: weekLabel(week.weekStart),
              sessions: week.sessions,
              durationSeconds: week.durationSeconds,
              distanceMeters: week.distanceMeters,
            }))}
          />
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Aderência" description="Prescrito × cumprido e a nota de aderência armazenada.">
          <dl className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/60">Prescritos na janela</dt>
              <dd className="font-semibold tabular-nums">{adherence.prescribed}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/60">Cumpridos</dt>
              <dd className="font-semibold tabular-nums">
                {adherence.done}
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
        Esta análise usa volume, consistência e aderência — todos agregados de dados já registrados.
        Métricas de carga de treino do tipo CTL/ATL/TSB não são exibidas porque dependem de séries
        temporais por segundo, que o produto ainda não armazena.
      </p>
    </AthleteHubShell>
  );
}
