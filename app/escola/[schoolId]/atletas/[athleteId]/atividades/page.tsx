/**
 * SAM-37 — Atividades do atleta na administração da escola.
 *
 * The same list the coach reads (`GetCoachAthleteActivities`, scope
 * `school-admin`): imported activities and self-logged sessions since the
 * athlete's current membership, prescribed × executed on each card, earlier
 * dates only with the athlete's `activities` consent. Filters and page live in
 * the URL; each imported activity opens the shared detail view.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { AthleteActivitiesList } from "@/components/activities/athlete-activities-list";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetCoachAthleteActivities } from "@/modules/school/application/get-coach-athlete-activities";
import { SchoolError } from "@/modules/school/domain/errors";
import { formatDate } from "@/modules/school/presentation/format";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import {
  ActivitiesFilters,
  ActivitiesPagination,
  activitiesQuery,
  parseDays,
  parseOrigin,
  type ActivitiesSearchParams,
} from "@/app/professor/_athlete-hub/activities-screen";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string }>;
  searchParams: Promise<ActivitiesSearchParams>;
};

const activities = new GetCoachAthleteActivities(prisma);

export default async function SchoolAthleteActivitiesPage({ params, searchParams }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, athleteId } = await params;
  const query = await searchParams;

  const days = parseDays(query.dias);
  const origin = parseOrigin(query.origem);
  const page = Math.max(1, Number(query.pagina) || 1);

  let data: Awaited<ReturnType<typeof activities.execute>>;
  try {
    data = await activities.execute(session.user.id, { kind: "school-admin", schoolId }, athleteId, {
      days, origin, page,
      ...(query.modalidade ? { sportType: query.modalidade } : {}),
    });
  } catch (error) {
    // Authorization and lookup failures collapse into 404 (no probing).
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { context, items } = data;
  const base = `/escola/${schoolId}/atletas/${athleteId}`;
  const href = (options: Parameters<typeof activitiesQuery>[0]) => `${base}/atividades${activitiesQuery(options)}`;
  const name = context.athlete.name ?? context.athlete.email ?? "Atleta";

  return (
    <div className="space-y-6">
      <div>
        <Link href={base} className="text-xs text-foreground/50 transition-colors hover:text-foreground">
          ← Ficha de {name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Atividades de {name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {context.currentCoach
            ? <StatusBadge tone="success">{`Professor: ${context.currentCoach.name}`}</StatusBadge>
            : <StatusBadge tone="warning">Sem professor</StatusBadge>}
          <span className="text-xs text-foreground/45">Vínculo atual desde {formatDate(context.periodStart)}</span>
        </div>
      </div>

      {data.withheldBeforePeriod > 0 && (
        <p className="theme-panel-warning rounded-[20px] border px-4 py-3 text-xs leading-6">
          {`${data.withheldBeforePeriod} atividade(s) anteriores ao vínculo atual não aparecem nesta lista: `
            + "o acesso a períodos anteriores depende de autorização do atleta."}
        </p>
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
              description="Quando o atleta sincronizar o relógio ou registrar uma atividade, ela aparece aqui."
            />
          ) : (
            <AthleteActivitiesList
              items={items}
              timeZone={context.timeZone}
              activityHref={(activityId) => `${base}/atividades/${activityId}`}
              // The school sheet opens prescriptions in its own modal, not on a route of their own.
              prescriptionHref={null}
            />
          )}
          <ActivitiesPagination href={href} page={data.page} pageCount={data.pageCount} days={days} origin={origin} sportType={data.sportType} />
        </div>
      </SectionCard>
    </div>
  );
}
