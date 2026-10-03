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
import { WorkoutInsightsSections } from "@/components/school/workout-insights";
import { WorkoutCommentsThread } from "@/components/school/workout-comments-thread";
import { StatusBadge } from "@/components/status-badge";
import { SaveAsTemplateButton } from "@/components/workouts/save-as-template-button";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetCoachAthleteWorkoutDetail } from "@/modules/school/application/get-coach-athlete-workout-detail";
import { displayScore } from "@/modules/school/domain/coach-evaluation";
import { SchoolError } from "@/modules/school/domain/errors";
import { formatScheduledDate, formatScheduledDateTime } from "@/modules/school/presentation/format";
import { describeBlockTargets } from "@/modules/school/presentation/workout-blocks";
import { summarizeWorkoutBlocks } from "@/modules/school/presentation/workout-summary";
import { getActivityVisualDataWithSplitFallback } from "@/modules/strava/application/activities/activity-visual-with-split-fallback";
import {
  ASSIGNMENT_EVENT_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  CHANGE_REQUEST_STATUS_LABELS,
} from "@/modules/school/presentation/workout-labels";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell, WithheldNotice } from "./athlete-hub-shell";
import { athleteHubHref, hubBasePath, type CoachAthleteScope } from "./hub-scope";

// SAM-17 — the provider modules' detail loader is injected here, at the app
// layer, so the school module stays provider-agnostic.
const detail = new GetCoachAthleteWorkoutDetail(prisma, undefined, getActivityVisualDataWithSplitFallback);

const OPEN_REQUEST_STATUSES = new Set(["PENDING", "ACKNOWLEDGED"]);

export async function WorkoutDetailScreen({
  scope,
  athleteId,
  assignmentId,
}: {
  scope: CoachAthleteScope;
  athleteId: string;
  assignmentId: string;
}) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();

  let data: Awaited<ReturnType<typeof detail.execute>>;
  try {
    data = await detail.execute(session.user.id, scope, athleteId, assignmentId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { context, assignment, workout, execution } = data;
  // SAM-16 — every instant on this screen reads in the calendar's zone.
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
  const planned = summarizeWorkoutBlocks(workout?.blocks ?? null);

  const statusTone = assignment.overdue
    ? "warning" as const
    : assignment.status === "COMPLETED" || assignment.status === "PARTIALLY_COMPLETED"
      ? "success" as const
      : assignment.status === "MISSED" ? "danger" as const : "neutral" as const;

  return (
    <AthleteHubShell
      scope={scope}
      athlete={context.athlete}
      teams={context.teams}
      currentCoach={context.currentCoach}
      isResponsibleCoach={context.isResponsibleCoach}
      active="treinos"
      actions={
        <span className="flex flex-wrap items-start gap-2">
          {/* SAM-58 — only a prescription with content can become a template; the server checks authorship. */}
          {workout && <SaveAsTemplateButton assignmentId={assignment.id} />}
          <Link
            href={athleteHubHref(scope, athleteId, "treinos")}
            className="glass-button rounded-full px-4 py-2 text-sm font-medium"
          >
            Voltar aos treinos
          </Link>
        </span>
      }
    >
      <SectionCard
        title={workout?.title ?? assignment.sourceLabel ?? "Treino agendado"}
        description="Prescrição, execução e trilha de alterações deste treino."
        action={
          execution ? (
            <Link
              href={`${hubBasePath(scope, athleteId)}/avaliar?execId=${execution.id}`}
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
                // SAM-17 — repetitions and rest count, the same number the
                // school's workout modal shows (SAM-5).
                targetDurationSeconds={planned.estimatedDurationSeconds}
                targetDistanceMeters={planned.plannedDistanceMeters}
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

              {/* SAM-34 — the activity behind this execution has its own page, the same the athlete sees. */}
              {execution.activityId && (
                <p className="text-xs">
                  <Link
                    href={`${hubBasePath(scope, athleteId)}/atividades/${execution.activityId}`}
                    className="font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
                    data-testid="linked-activity-link"
                  >
                    Abrir a atividade importada (resumo, zonas, voltas e análise)
                  </Link>
                </p>
              )}

              {/* SAM-17 — zones, laps and overlay from the linked activity; honest empty state otherwise. */}
              {data.insights ? (
                <WorkoutInsightsSections insights={data.insights} />
              ) : (
                <section className="space-y-2" data-testid="insights-empty">
                  <SectionTitle>Zonas e laps</SectionTitle>
                  <p className="text-sm text-foreground/50">
                    {execution.hasLinkedActivity
                      ? "A atividade vinculada não trouxe zonas nem laps (o provedor não enviou ou a leitura não está disponível agora)."
                      : "Nenhuma atividade importada para este treino."}
                  </p>
                </section>
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
            <section className="space-y-2" data-testid="insights-empty">
              <SectionTitle>Execução</SectionTitle>
              <p className="text-sm text-foreground/50">
                Nenhuma atividade importada para este treino.
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

          {/* SAM-27 — the same thread the athlete sees; a pending review request reads as such. */}
          <section className="space-y-2 border-t border-white/10 pt-4" data-testid="coach-comments-section">
            <SectionTitle>Conversa com o atleta</SectionTitle>
            {data.comments.some((comment) => comment.kind === "REVIEW_REQUEST" && comment.resolvedAt === null) && (
              <p className="theme-panel-warning rounded-[14px] border px-3 py-2 text-xs" data-testid="review-pending">
                O atleta pediu revisão deste treino. Avaliar a execução encerra o pedido.
              </p>
            )}
            <WorkoutCommentsThread
              assignmentId={assignment.id}
              viewerId={session.user.id}
              placeholder="Escreva para o atleta…"
              comments={data.comments.map((comment) => ({
                id: comment.id,
                kind: comment.kind as "COMMENT" | "REVIEW_REQUEST",
                body: comment.body,
                createdAt: comment.createdAt.toISOString(),
                resolvedAt: comment.resolvedAt?.toISOString() ?? null,
                author: comment.author,
              }))}
            />
          </section>

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
