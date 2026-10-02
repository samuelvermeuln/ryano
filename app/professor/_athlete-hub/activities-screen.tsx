/**
 * SAM-34 — Atividades do atleta (visão do professor).
 *
 * Everything the athlete did — imported from any provider or logged by hand —
 * prescribed or not, with the prescribed × executed outcome on each card.
 * Filters (window, origin, modality) and the page live in the URL, like the
 * prescriptions list. Each imported activity links to its own detail page,
 * which is the same view the athlete sees.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDistance, formatDuration, formatHeartRate } from "@/lib/format";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import {
  ACTIVITY_ORIGIN_FILTERS,
  ACTIVITY_WINDOW_DAYS,
  GetCoachAthleteActivities,
  type ActivityOriginFilter,
  type CoachAthleteActivityItem,
} from "@/modules/school/application/get-coach-athlete-activities";
import { SchoolError } from "@/modules/school/domain/errors";
import { formatScheduledDateTime } from "@/modules/school/presentation/format";
import { PRESCRIPTION_OUTCOME_LABELS } from "@/modules/school/presentation/workout-labels";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { ProviderId } from "@/modules/shared/integrations/types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell, WithheldNotice } from "./athlete-hub-shell";
import { athleteHubHref, hubBasePath, type CoachAthleteScope } from "./hub-scope";

export type ActivitiesSearchParams = { dias?: string; origem?: string; modalidade?: string; pagina?: string };

const activities = new GetCoachAthleteActivities(prisma);

const ORIGIN_LABELS: Record<ActivityOriginFilter, string> = {
  todas: "Todas",
  "nao-planejadas": "Não planejadas",
  prescritas: "Com prescrição",
};

function parseOrigin(value: string | undefined): ActivityOriginFilter {
  return (ACTIVITY_ORIGIN_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as ActivityOriginFilter)
    : "todas";
}

function parseDays(value: string | undefined): number {
  const parsed = Number(value);
  return (ACTIVITY_WINDOW_DAYS as readonly number[]).includes(parsed) ? parsed : 90;
}

export function activitiesHref(
  scope: CoachAthleteScope,
  athleteId: string,
  options: { days?: number; origin?: ActivityOriginFilter; sportType?: string | null; page?: number },
): string {
  const query = new URLSearchParams();
  if (options.days && options.days !== 90) query.set("dias", String(options.days));
  if (options.origin && options.origin !== "todas") query.set("origem", options.origin);
  if (options.sportType) query.set("modalidade", options.sportType);
  if (options.page && options.page > 1) query.set("pagina", String(options.page));
  const suffix = query.toString();
  return `${athleteHubHref(scope, athleteId, "atividades")}${suffix ? `?${suffix}` : ""}`;
}

export function outcomeTone(outcome: CoachAthleteActivityItem["outcome"]) {
  switch (outcome) {
    case "EXECUTED_AS_PLANNED": return "success" as const;
    case "EXECUTED_PARTIALLY": return "warning" as const;
    case "EXECUTED_DIFFERENTLY": return "warning" as const;
    case "UNPLANNED_ACTIVITY": return "neutral" as const;
    default: return "neutral" as const;
  }
}

function providerLabel(provider: string | null): string {
  if (!provider) return "Registro do atleta";
  return getProviderDefinition(provider as ProviderId)?.name ?? provider;
}

function pillClass(active: boolean, tone: "info" | "neutral" = "info"): string {
  return `block rounded-full border px-3 py-1.5 text-xs transition-colors ${
    active
      ? `theme-pill-${tone} font-medium`
      : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10 hover:text-foreground"
  }`;
}

export async function ActivitiesScreen({
  scope,
  athleteId,
  query,
}: {
  scope: CoachAthleteScope;
  athleteId: string;
  query: ActivitiesSearchParams;
}) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();

  const days = parseDays(query.dias);
  const origin = parseOrigin(query.origem);
  const page = Math.max(1, Number(query.pagina) || 1);

  let data: Awaited<ReturnType<typeof activities.execute>>;
  try {
    data = await activities.execute(session.user.id, scope, athleteId, {
      days, origin, page,
      ...(query.modalidade ? { sportType: query.modalidade } : {}),
    });
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { context, items } = data;
  const base = hubBasePath(scope, athleteId);

  return (
    <AthleteHubShell
      scope={scope}
      athlete={context.athlete}
      teams={context.teams}
      currentCoach={context.currentCoach}
      isResponsibleCoach={context.isResponsibleCoach}
      active="atividades"
    >
      {data.withheldBeforePeriod > 0 && (
        <WithheldNotice>
          {`${data.withheldBeforePeriod} atividade(s) anteriores a este vínculo não aparecem nesta lista: `
            + "o histórico anterior depende de autorização do próprio atleta."}
        </WithheldNotice>
      )}

      <SectionCard
        title="Atividades"
        description="Tudo o que o atleta fez neste vínculo — importado do relógio ou registrado por ele — com ou sem prescrição."
      >
        <div className="flex flex-col gap-3">
          <nav aria-label="Filtrar atividades por origem" className="overflow-x-auto">
            <ul className="flex min-w-max gap-2">
              {ACTIVITY_ORIGIN_FILTERS.map((option) => (
                <li key={option}>
                  <Link
                    href={activitiesHref(scope, athleteId, { days, origin: option, sportType: data.sportType })}
                    aria-current={option === origin ? "page" : undefined}
                    className={pillClass(option === origin)}
                  >
                    {option === "nao-planejadas" ? `${ORIGIN_LABELS[option]} (${data.unplannedCount})` : ORIGIN_LABELS[option]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Filtrar atividades por período" className="overflow-x-auto">
            <ul className="flex min-w-max gap-2">
              {ACTIVITY_WINDOW_DAYS.map((option) => (
                <li key={option}>
                  <Link
                    href={activitiesHref(scope, athleteId, { days: option, origin, sportType: data.sportType })}
                    aria-current={option === days ? "page" : undefined}
                    className={pillClass(option === days, "neutral")}
                  >
                    {option === 365 ? "1 ano" : `${option} dias`}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {data.availableSportTypes.length > 1 && (
            <nav aria-label="Filtrar atividades por modalidade" className="overflow-x-auto">
              <ul className="flex min-w-max gap-2">
                <li>
                  <Link
                    href={activitiesHref(scope, athleteId, { days, origin, sportType: null })}
                    aria-current={data.sportType === null ? "page" : undefined}
                    className={pillClass(data.sportType === null, "neutral")}
                  >
                    Todas as modalidades
                  </Link>
                </li>
                {data.availableSportTypes.map((sport) => (
                  <li key={sport}>
                    <Link
                      href={activitiesHref(scope, athleteId, { days, origin, sportType: sport })}
                      aria-current={data.sportType === sport ? "page" : undefined}
                      className={pillClass(data.sportType === sport, "neutral")}
                    >
                      {resolveSportLabel(sport)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>

        <div className="mt-5">
          {items.length === 0 ? (
            <EmptyState
              title="Nenhuma atividade neste período"
              description={
                origin === "todas"
                  ? "Quando o atleta sincronizar o relógio ou registrar uma atividade, ela aparece aqui."
                  : "Troque o filtro de origem ou o período para ver as outras atividades."
              }
            />
          ) : (
            <ul className="space-y-2" data-testid="athlete-activities">
              {items.map((item) => {
                const body = (
                  <>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.name ?? resolveSportLabel(item.sportType)}</span>
                      <span className="block text-xs text-foreground/55">
                        {[formatScheduledDateTime(item.startedAt, context.timeZone), resolveSportLabel(item.sportType), providerLabel(item.provider)]
                          .filter(Boolean).join(" · ")}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-foreground/50">
                        {(item.movingSeconds ?? item.durationSeconds) != null && (
                          <span>⏱ {formatDuration(item.movingSeconds ?? item.durationSeconds)}</span>
                        )}
                        {item.distanceMeters != null && <span>📏 {formatDistance(item.distanceMeters)}</span>}
                        {item.averageHeartRate != null && <span>♥ {formatHeartRate(item.averageHeartRate)}</span>}
                      </span>
                      {item.prescription && (
                        <span className="mt-1 block text-xs text-foreground/60">
                          {"Prescrição: "}
                          <Link
                            href={`${base}/treinos/${item.prescription.assignmentId}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {item.prescription.title}
                          </Link>
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      {item.outcome
                        ? <StatusBadge tone={outcomeTone(item.outcome)}>{PRESCRIPTION_OUTCOME_LABELS[item.outcome]}</StatusBadge>
                        : <StatusBadge tone="neutral">Prescrição de outro vínculo</StatusBadge>}
                    </span>
                  </>
                );
                const className = "flex flex-col gap-2 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between";
                return (
                  <li key={`${item.kind}:${item.id}`} data-testid="athlete-activity" data-outcome={item.outcome ?? "other-scope"}>
                    {item.kind === "imported" ? (
                      <Link
                        href={`${base}/atividades/${item.id}`}
                        aria-label={`Abrir atividade ${item.name ?? resolveSportLabel(item.sportType)}`}
                        className={`${className} transition-colors hover:bg-white/10`}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className={className}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {data.pageCount > 1 && (
            <nav aria-label="Páginas de atividades" className="mt-4 flex items-center justify-between text-xs text-foreground/60">
              {data.page > 1 ? (
                <Link href={activitiesHref(scope, athleteId, { days, origin, sportType: data.sportType, page: data.page - 1 })} className="underline-offset-4 hover:underline">
                  Página anterior
                </Link>
              ) : <span />}
              <span>{`Página ${data.page} de ${data.pageCount}`}</span>
              {data.page < data.pageCount ? (
                <Link href={activitiesHref(scope, athleteId, { days, origin, sportType: data.sportType, page: data.page + 1 })} className="underline-offset-4 hover:underline">
                  Próxima página
                </Link>
              ) : <span />}
            </nav>
          )}
        </div>
      </SectionCard>
    </AthleteHubShell>
  );
}
