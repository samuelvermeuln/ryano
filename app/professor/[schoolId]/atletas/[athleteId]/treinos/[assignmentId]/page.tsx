/**
 * SAM-11 — Detalhe de um treino do atleta (visão do professor).
 *
 * Its own route rather than a modal: the prescribed structure, the
 * prescribed-vs-executed table, the compliance breakdown and the change trail add
 * up to a page's worth of content, and the coach needs to be able to send the
 * address of one workout to a colleague (architecture/rules/ui.md — large detail
 * becomes its own page with a URL; modals are for small record detail).
 *
 * Rendering is delegated to `components/school/workout-structure`, the same
 * components the school's administration sheet uses, so the two screens cannot
 * disagree about what a block or an adherence score means.
 *
 * The athlete's own feedback is shown only when `CanReadAthleteHistory` allows it
 * for that date; otherwise the screen says the consent is missing instead of
 * implying no feedback exists.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import {
  ComplianceBreakdown,
  PrescribedVsExecuted,
  SectionTitle,
  WorkoutStructureSection,
  type WorkoutStructureBlock,
} from "@/components/school/workout-structure";
import { StatusBadge } from "@/components/status-badge";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetCoachAthleteWorkoutDetail } from "@/modules/school/application/get-coach-athlete-workout-detail";
import { displayScore } from "@/modules/school/domain/coach-evaluation";
import { SchoolError } from "@/modules/school/domain/errors";
import { formatScheduledDate, formatScheduledDateTime } from "@/modules/school/presentation/format";
import { describeBlockTargets } from "@/modules/school/presentation/workout-blocks";
import {
  ASSIGNMENT_EVENT_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  CHANGE_REQUEST_STATUS_LABELS,
} from "@/modules/school/presentation/workout-labels";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell, athleteHubHref, WithheldNotice } from "../../athlete-hub-shell";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string; assignmentId: string }>;
};

const detail = new GetCoachAthleteWorkoutDetail(prisma);

const OPEN_REQUEST_STATUSES = new Set(["PENDING", "ACKNOWLEDGED"]);

export default async function AthleteWorkoutDetailPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, athleteId, assignmentId } = await params;

  let data: Awaited<ReturnType<typeof detail.execute>>;
  try {
    data = await detail.execute(session.user.id, schoolId, athleteId, assignmentId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { context, assignment, workout, execution } = data;
  // SAM-16 — every instant on this screen reads in the school's zone.
  const dateTimeLabel = (value: Date | null) => formatScheduledDateTime(value, context.timeZone);
  const dateLabel = (value: Date | null) => formatScheduledDate(value, context.timeZone);

  const blocks: WorkoutStructureBlock[] | null = workout
    ? workout.blocks.map((block) => ({
      id: block.id,
      blockType: block.blockType,
      title: block.title,
      durationS: block.durationS,
      distanceM: block.distanceM,
      repetitions: block.repetitions,
      targets: describeBlockTargets(block.targetPayload),
      restTargets: describeBlockTargets(block.restPayload),
    }))
    : null;

  const statusTone = assignment.overdue
    ? "warning" as const
    : assignment.status === "COMPLETED" || assignment.status === "PARTIALLY_COMPLETED"
      ? "success" as const
      : assignment.status === "MISSED" ? "danger" as const : "neutral" as const;

  return (
    <AthleteHubShell
      schoolId={schoolId}
      athlete={context.athlete}
      teams={context.teams}
      currentCoach={context.currentCoach}
      isResponsibleCoach={context.isResponsibleCoach}
      active="treinos"
      actions={
        <Link
          href={athleteHubHref(schoolId, athleteId, "treinos")}
          className="glass-button rounded-full px-4 py-2 text-sm font-medium"
        >
          Voltar aos treinos
        </Link>
      }
    >
      <SectionCard
        title={workout?.title ?? assignment.sourceLabel ?? "Treino agendado"}
        description="Prescrição, execução e trilha de alterações deste treino."
        action={
          execution ? (
            <Link
              href={`/professor/${schoolId}/atletas/${athleteId}/avaliar?execId=${execution.id}`}
              aria-label="Avaliar esta execução"
              className="glass-button rounded-full px-4 py-2 text-xs font-medium"
            >
              Avaliar execução
            </Link>
          ) : undefined
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-foreground/60">
            <StatusBadge tone={statusTone}>
              {assignment.overdue
                ? "Atrasado"
                : ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status}
            </StatusBadge>
            <span>{dateTimeLabel(assignment.scheduledAt)}</span>
            {workout?.sportType && <span>{resolveSportLabel(workout.sportType)}</span>}
            {assignment.coach && <span>Professor: {assignment.coach.name}</span>}
            {assignment.team && <span>Turma: {assignment.team}</span>}
            {assignment.isOwnPrescription && <StatusBadge tone="neutral">Prescrição sua</StatusBadge>}
          </div>

          {workout?.description && (
            <section className="space-y-1">
              <SectionTitle>Descrição</SectionTitle>
              <p className="whitespace-pre-line text-sm text-foreground/80">{workout.description}</p>
            </section>
          )}

          <WorkoutStructureSection blocks={blocks} sourceLabel={assignment.sourceLabel} />

          {execution ? (
            <>
              <PrescribedVsExecuted
                targetDurationSeconds={
                  blocks?.reduce((sum, block) => sum + (block.durationS ?? 0), 0) || null
                }
                targetDistanceMeters={
                  blocks?.reduce((sum, block) => sum + (block.distanceM ?? 0), 0) || null
                }
                execution={{
                  source: execution.source,
                  startedLabel: dateTimeLabel(execution.startedAt),
                  durationSeconds: execution.durationSeconds,
                  distanceMeters: execution.distanceMeters,
                  averageHeartRate: execution.averageHeartRate,
                  averagePower: execution.averagePower,
                  complianceScore: execution.compliance?.overallScore ?? null,
                }}
              />

              {execution.compliance && (
                <ComplianceBreakdown
                  overallScore={execution.compliance.overallScore}
                  breakdown={execution.compliance.breakdown as Record<string, number>}
                />
              )}

              {execution.feedback ? (
                <section className="space-y-2">
                  <SectionTitle>Feedback do atleta</SectionTitle>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
                    <p className="flex flex-wrap gap-x-4 text-foreground/75">
                      <span>RPE <strong>{execution.feedback.rpe}</strong>/10</span>
                      {execution.feedback.mood != null && (
                        <span>Humor <strong>{execution.feedback.mood}</strong>/5</span>
                      )}
                      {execution.feedback.energy != null && (
                        <span>Energia <strong>{execution.feedback.energy}</strong>/5</span>
                      )}
                    </p>
                    {execution.feedback.comment && (
                      <p className="mt-2 whitespace-pre-line text-foreground/70">
                        {execution.feedback.comment}
                      </p>
                    )}
                  </div>
                </section>
              ) : data.feedbackWithheld ? (
                <WithheldNotice>
                  O atleta registrou feedback para este treino, mas a leitura desse dado depende de uma
                  autorização de histórico que cobre esta data.
                </WithheldNotice>
              ) : null}

              {execution.evaluation && (
                <section className="space-y-2">
                  <SectionTitle>Sua avaliação</SectionTitle>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
                    <p className="text-lg font-semibold tabular-nums">
                      {displayScore(execution.evaluation.overallScore).toFixed(1)}
                      <span className="text-xs font-normal text-foreground/50">/10</span>
                    </p>
                    {execution.evaluation.note && (
                      <p className="mt-1 whitespace-pre-line text-foreground/70">
                        {execution.evaluation.note}
                      </p>
                    )}
                  </div>
                </section>
              )}
            </>
          ) : (
            <section className="space-y-2">
              <SectionTitle>Execução</SectionTitle>
              <p className="text-sm text-foreground/50">
                Nenhuma execução associada a este treino ainda.
              </p>
            </section>
          )}

          {data.changeRequests.length > 0 && (
            <section className="space-y-2 border-t border-white/10 pt-4">
              <SectionTitle>Solicitações de alteração</SectionTitle>
              <ul className="space-y-2">
                {data.changeRequests.map((request) => (
                  <li
                    key={request.id}
                    className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusBadge tone={OPEN_REQUEST_STATUSES.has(request.status) ? "warning" : "neutral"}>
                        {CHANGE_REQUEST_STATUS_LABELS[request.status] ?? request.status}
                      </StatusBadge>
                      <span className="text-xs text-foreground/45">
                        {(request.requester?.name ?? request.requester?.email ?? "Escola")}
                        {" · "}
                        {dateLabel(request.createdAt)}
                      </span>
                    </div>
                    <p className="text-foreground/75">{request.reason}</p>
                    {request.resolutionNote && (
                      <p className="text-xs text-foreground/55">Resposta: {request.resolutionNote}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.history.length > 0 && (
            <section className="space-y-2 border-t border-white/10 pt-4">
              <SectionTitle>Trilha deste treino</SectionTitle>
              <ol className="space-y-1.5 text-xs text-foreground/60">
                {data.history.map((event) => (
                  <li key={event.id} className="flex flex-wrap gap-x-2">
                    <span className="tabular-nums text-foreground/45">{dateLabel(event.createdAt)}</span>
                    <span className="text-foreground/75">
                      {ASSIGNMENT_EVENT_LABELS[event.eventType] ?? event.eventType}
                    </span>
                    {(event.actor?.name ?? event.actor?.email) && (
                      <span>· {event.actor?.name ?? event.actor?.email}</span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </SectionCard>
    </AthleteHubShell>
  );
}
