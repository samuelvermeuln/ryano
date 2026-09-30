/**
 * Ficha do atleta na administração da escola: tudo o que foi prescrito a ele
 * aqui — o que já fez, o que está atrasado e o que ainda vem — com a estrutura
 * completa de cada treino e o pedido de alteração ao professor responsável.
 *
 * Só dados desta escola e do vínculo atual. Atividades que o atleta registrou por
 * conta própria, feedback e biometria dependem de consentimento dele (ADR-005) e
 * não aparecem aqui; ver GetSchoolAthleteTraining.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { humanizeActivityLabel } from "@/lib/activity-text";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import {
  ATHLETE_TRAINING_DEFAULT_LIMIT,
  ATHLETE_TRAINING_FILTERS,
  ATHLETE_TRAINING_MAX_LIMIT,
  GetSchoolAthleteTraining,
  type AthleteTrainingFilter,
} from "@/modules/school/application/get-school-athlete-training";
import { SchoolError } from "@/modules/school/domain/errors";
import { formatDate, formatDateTime } from "@/modules/school/presentation/format";
import { describeBlockTargets } from "@/modules/school/presentation/workout-blocks";
import { ASSIGNMENT_EVENT_LABELS } from "@/modules/school/presentation/workout-labels";
import { summarizeWorkoutBlocks } from "@/modules/school/presentation/workout-summary";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import { StatusBadge } from "@/components/status-badge";
import { AthleteTrainingPanel, type TrainingItem } from "./athlete-training-panel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string }>;
  searchParams: Promise<{ filtro?: string; limite?: string }>;
};

const FILTER_LABELS: Record<AthleteTrainingFilter, string> = {
  todos: "Todos",
  proximos: "Próximos",
  atrasados: "Atrasados",
  realizados: "Realizados",
  "sem-execucao": "Sem execução",
};

const dayFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit",
});

function parseFilter(value: string | undefined): AthleteTrainingFilter {
  return ATHLETE_TRAINING_FILTERS.find((filter) => filter === value) ?? "todos";
}

/** Anything that is not a sane positive integer falls back to the default page size. */
function parseLimit(value: string | undefined): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return Math.min(parsed, ATHLETE_TRAINING_MAX_LIMIT);
}

function sportLabel(sportType: string | null | undefined): string | null {
  if (!sportType) return null;
  return humanizeActivityLabel(sportType) ?? sportType;
}

function sheetHref(schoolId: string, athleteId: string, filter: AthleteTrainingFilter, limit?: number) {
  const query = new URLSearchParams();
  if (filter !== "todos") query.set("filtro", filter);
  if (limit && limit !== ATHLETE_TRAINING_DEFAULT_LIMIT) query.set("limite", String(limit));
  const suffix = query.toString();
  return `/escola/${schoolId}/atletas/${athleteId}${suffix ? `?${suffix}` : ""}`;
}

export default async function AtletaFichaPage({ params, searchParams }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, athleteId } = await params;
  const query = await searchParams;

  let sheet;
  try {
    sheet = await new GetSchoolAthleteTraining(prisma).execute(session.user.id, schoolId, athleteId, {
      filter: parseFilter(query.filtro),
      limit: parseLimit(query.limite),
    });
  } catch (error) {
    // Authorization and lookup failures collapse into 404, so this URL cannot be
    // used to probe which athletes belong to a school.
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const items: TrainingItem[] = sheet.items.map((item) => {
    const blocks = item.workout?.blocks.map((block) => ({
      id: block.id,
      blockType: block.blockType,
      title: block.title,
      durationS: block.durationS,
      distanceM: block.distanceM,
      repetitions: block.repetitions,
      // Raw JSON payloads stay on the server; the client gets display lines only.
      targets: describeBlockTargets(block.targetPayload),
      restTargets: describeBlockTargets(block.restPayload),
    })) ?? null;

    // SAM-5 — resumo (tempo estimado com repetições e descanso, distância,
    // intensidade) e rastreabilidade; ambos calculados aqui, com os payloads
    // brutos, e entregues já formatados ao modal.
    const summary = summarizeWorkoutBlocks(item.workout?.blocks ?? null);
    const lastChange = [item.updatedAt, item.workout?.updatedAt].filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    // Tolerância de 1 min: a criação grava createdAt e updatedAt em instantes diferentes.
    const changedAfterPrescription = item.adaptationVersion > 0
      || (lastChange != null && lastChange.getTime() - item.prescribedAt.getTime() > 60_000);

    return {
      summary,
      traceability: {
        prescribedByName: item.workout?.authorCoachName ?? item.coach?.name ?? null,
        prescribedLabel: formatDateTime(item.prescribedAt),
        lastChangedLabel: changedAfterPrescription && lastChange ? formatDateTime(lastChange) : null,
        changedAfterPrescription,
        version: item.adaptationVersion,
        events: item.history.map((event) => ({
          label: ASSIGNMENT_EVENT_LABELS[event.eventType] ?? event.eventType,
          actorName: event.actorName,
          dateLabel: formatDateTime(event.createdAt),
        })),
      },
      id: item.id,
      dateLabel: item.scheduledAt ? dayFormat.format(item.scheduledAt) : "Sem data",
      title: item.workout?.title ?? item.sourceLabel ?? "Treino agendado",
      sportLabel: sportLabel(item.workout?.sportType),
      status: item.status,
      overdue: item.overdue,
      team: item.team,
      coach: item.coach,
      description: item.workout?.description ?? null,
      blocks,
      sourceLabel: item.sourceLabel,
      targetDurationSeconds: blocks?.reduce((sum, block) => sum + (block.durationS ?? 0), 0) || null,
      targetDistanceMeters: blocks?.reduce((sum, block) => sum + (block.distanceM ?? 0), 0) || null,
      execution: item.execution
        ? {
          source: item.execution.source,
          startedLabel: formatDateTime(item.execution.startedAt),
          durationSeconds: item.execution.durationSeconds,
          distanceMeters: item.execution.distanceMeters,
          averageHeartRate: item.execution.averageHeartRate,
          averagePower: item.execution.averagePower,
          complianceScore: item.execution.complianceScore,
        }
        : null,
      changeRequests: item.changeRequests.map((request) => ({
        id: request.id,
        status: request.status,
        reason: request.reason,
        resolutionNote: request.resolutionNote,
        requesterName: request.requester.name ?? request.requester.email ?? "Administração",
        createdLabel: formatDate(request.createdAt),
        resolvedLabel: request.resolvedAt
          ? `Fechada${request.resolver?.name ? ` por ${request.resolver.name}` : ""} em ${formatDate(request.resolvedAt)}`
          : null,
      })),
    };
  });

  const safetyNotes = sheet.safetyNotes
    ? { restrictions: sheet.safetyNotes.restrictions, updatedLabel: formatDate(sheet.safetyNotes.updatedAt) }
    : null;

  const { athlete, counts, currentCoach, teams } = sheet;
  const name = athlete.name ?? athlete.email ?? "Atleta";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/escola/${schoolId}/atletas`}
          className="text-xs text-foreground/50 transition-colors hover:text-foreground"
        >
          ← Atletas
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{name}</h1>
        {athlete.name && athlete.email && <p className="mt-1 text-sm text-foreground/60">{athlete.email}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {currentCoach
            ? <StatusBadge tone="success">{`Professor: ${currentCoach.name}`}</StatusBadge>
            : <StatusBadge tone="warning">Sem professor</StatusBadge>}
          {teams.map((team) => (
            <StatusBadge key={team} tone="neutral">{team}</StatusBadge>
          ))}
          <span className="text-xs text-foreground/45">Vínculo atual desde {formatDate(sheet.periodStart)}</span>
        </div>
      </div>

      <StatTiles
        items={[
          { label: "Próximos", value: counts.proximos, hint: "Ainda por fazer" },
          {
            label: "Atrasados",
            value: counts.atrasados,
            tone: counts.atrasados > 0 ? "warning" : "success",
            hint: counts.atrasados > 0 ? "Vencidos sem execução" : "Em dia",
          },
          { label: "Realizados", value: counts.realizados },
          {
            label: "Alterações abertas",
            value: sheet.openChangeRequests,
            tone: sheet.openChangeRequests > 0 ? "warning" : "neutral",
            hint: "Aguardando o professor",
          },
        ]}
      />

      <SectionCard
        title="Treinos prescritos"
        description="Tudo o que a escola prescreveu a este atleta, com a estrutura de cada treino."
      >
        <nav aria-label="Filtrar treinos" className="mb-4 flex flex-wrap gap-2">
          {ATHLETE_TRAINING_FILTERS.map((filter) => (
            <Link
              key={filter}
              href={sheetHref(schoolId, athleteId, filter)}
              aria-current={sheet.filter === filter ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                sheet.filter === filter
                  ? "border-white/30 bg-white/10 text-foreground"
                  : "border-white/10 text-foreground/60 hover:border-white/25"
              }`}
            >
              {`${FILTER_LABELS[filter]} (${counts[filter]})`}
            </Link>
          ))}
        </nav>

        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-foreground/50">
            Nenhum treino neste filtro.
          </p>
        ) : (
          // Remount per filter so an open detail never carries over to another list.
          <AthleteTrainingPanel key={sheet.filter} schoolId={schoolId} items={items} safetyNotes={safetyNotes} />
        )}

        {sheet.hasMore && (
          <div className="mt-4 text-center">
            <Link
              href={sheetHref(schoolId, athleteId, sheet.filter, sheet.limit + ATHLETE_TRAINING_DEFAULT_LIMIT)}
              className="text-sm font-medium hover:underline"
            >
              Mostrar mais
            </Link>
          </div>
        )}

        {sheet.heldBack > 0 && (
          <p className="mt-4 text-xs text-foreground/45">
            {`${sheet.heldBack} treino(s) anteriores ao vínculo atual (${formatDate(sheet.periodStart)}) não são exibidos: o acesso a períodos anteriores depende de autorização do atleta.`}
          </p>
        )}
      </SectionCard>
    </div>
  );
}
