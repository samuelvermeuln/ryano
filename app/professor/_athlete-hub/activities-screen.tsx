/**
 * SAM-34 — Atividades do atleta (visão do professor).
 *
 * Everything the athlete did — imported from any provider or logged by hand —
 * prescribed or not, with the prescribed × executed outcome on each card.
 * Filters (window, origin, modality) and the page live in the URL, like the
 * prescriptions list. Each imported activity links to its own detail page,
 * which is the same view the athlete sees. The list itself is
 * `AthleteActivitiesList`, shared with the school's sheet (SAM-37).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { AthleteActivitiesList } from "@/components/activities/athlete-activities-list";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import {
  ACTIVITY_ORIGIN_FILTERS,
  ACTIVITY_WINDOW_DAYS,
  GetCoachAthleteActivities,
  type ActivityOriginFilter,
} from "@/modules/school/application/get-coach-athlete-activities";
import { SchoolError } from "@/modules/school/domain/errors";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell, WithheldNotice } from "./athlete-hub-shell";
import { athleteHubHref, hubBasePath, type CoachAthleteScope } from "./hub-scope";

export type ActivitiesSearchParams = { dias?: string; origem?: string; modalidade?: string; pagina?: string };

const activities = new GetCoachAthleteActivities(prisma);

export const ORIGIN_LABELS: Record<ActivityOriginFilter, string> = {
  todas: "Todas",
  "nao-planejadas": "Não planejadas",
  prescritas: "Com prescrição",
};

export function parseOrigin(value: string | undefined): ActivityOriginFilter {
  return (ACTIVITY_ORIGIN_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as ActivityOriginFilter)
    : "todas";
}

export function parseDays(value: string | undefined): number {
  const parsed = Number(value);
  return (ACTIVITY_WINDOW_DAYS as readonly number[]).includes(parsed) ? parsed : 90;
}

/** Query string of the activities list (shared by the coach hub and the school sheet). */
export function activitiesQuery(options: { days?: number; origin?: ActivityOriginFilter; sportType?: string | null; page?: number }): string {
  const query = new URLSearchParams();
  if (options.days && options.days !== 90) query.set("dias", String(options.days));
  if (options.origin && options.origin !== "todas") query.set("origem", options.origin);
  if (options.sportType) query.set("modalidade", options.sportType);
  if (options.page && options.page > 1) query.set("pagina", String(options.page));
  const suffix = query.toString();
  return suffix ? `?${suffix}` : "";
}

export function activitiesHref(
  scope: CoachAthleteScope,
  athleteId: string,
  options: { days?: number; origin?: ActivityOriginFilter; sportType?: string | null; page?: number },
): string {
  return `${athleteHubHref(scope, athleteId, "atividades")}${activitiesQuery(options)}`;
}

function pillClass(active: boolean, tone: "info" | "neutral" = "info"): string {
  return `block rounded-full border px-3 py-1.5 text-xs transition-colors ${
    active
      ? `theme-pill-${tone} font-medium`
      : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10 hover:text-foreground"
  }`;
}

/** Filters + pagination chrome around the list; the school sheet reuses it with its own hrefs. */
export function ActivitiesFilters({
  href,
  days,
  origin,
  sportType,
  availableSportTypes,
  unplannedCount,
}: {
  href: (options: { days?: number; origin?: ActivityOriginFilter; sportType?: string | null; page?: number }) => string;
  days: number;
  origin: ActivityOriginFilter;
  sportType: string | null;
  availableSportTypes: string[];
  unplannedCount: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Filtrar atividades por origem" className="overflow-x-auto">
        <ul className="flex min-w-max gap-2">
          {ACTIVITY_ORIGIN_FILTERS.map((option) => (
            <li key={option}>
              <Link
                href={href({ days, origin: option, sportType })}
                aria-current={option === origin ? "page" : undefined}
                className={pillClass(option === origin)}
              >
                {option === "nao-planejadas" ? `${ORIGIN_LABELS[option]} (${unplannedCount})` : ORIGIN_LABELS[option]}
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
                href={href({ days: option, origin, sportType })}
                aria-current={option === days ? "page" : undefined}
                className={pillClass(option === days, "neutral")}
              >
                {option === 365 ? "1 ano" : `${option} dias`}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {availableSportTypes.length > 1 && (
        <nav aria-label="Filtrar atividades por modalidade" className="overflow-x-auto">
          <ul className="flex min-w-max gap-2">
            <li>
              <Link
                href={href({ days, origin, sportType: null })}
                aria-current={sportType === null ? "page" : undefined}
                className={pillClass(sportType === null, "neutral")}
              >
                Todas as modalidades
              </Link>
            </li>
            {availableSportTypes.map((sport) => (
              <li key={sport}>
                <Link
                  href={href({ days, origin, sportType: sport })}
                  aria-current={sportType === sport ? "page" : undefined}
                  className={pillClass(sportType === sport, "neutral")}
                >
                  {resolveSportLabel(sport)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

export function ActivitiesPagination({
  href,
  page,
  pageCount,
  days,
  origin,
  sportType,
}: {
  href: (options: { days?: number; origin?: ActivityOriginFilter; sportType?: string | null; page?: number }) => string;
  page: number;
  pageCount: number;
  days: number;
  origin: ActivityOriginFilter;
  sportType: string | null;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Páginas de atividades" className="mt-4 flex items-center justify-between text-xs text-foreground/60">
      {page > 1 ? (
        <Link href={href({ days, origin, sportType, page: page - 1 })} className="underline-offset-4 hover:underline">
          Página anterior
        </Link>
      ) : <span />}
      <span>{`Página ${page} de ${pageCount}`}</span>
      {page < pageCount ? (
        <Link href={href({ days, origin, sportType, page: page + 1 })} className="underline-offset-4 hover:underline">
          Próxima página
        </Link>
      ) : <span />}
    </nav>
  );
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
  const href = (options: Parameters<typeof activitiesHref>[2]) => activitiesHref(scope, athleteId, options);

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
        <ActivitiesFilters
          href={href}
          days={days}
          origin={origin}
          sportType={data.sportType}
          availableSportTypes={data.availableSportTypes}
          unplannedCount={data.unplannedCount}
        />

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
            <AthleteActivitiesList
              items={items}
              timeZone={context.timeZone}
              activityHref={(activityId) => `${base}/atividades/${activityId}`}
              prescriptionHref={(assignmentId) => `${base}/treinos/${assignmentId}`}
            />
          )}
          <ActivitiesPagination href={href} page={data.page} pageCount={data.pageCount} days={days} origin={origin} sportType={data.sportType} />
        </div>
      </SectionCard>
    </AthleteHubShell>
  );
}
