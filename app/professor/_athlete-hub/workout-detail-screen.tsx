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
import { PrescriptionVersions } from "@/components/workouts/prescription-versions";
import { prescriptionVersionsOf } from "@/modules/school/application/prescription-revisions";
import { sessionExecutionView } from "@/modules/school/application/session-feedback";
import { SessionFeedbackSummary } from "@/components/workouts/session-feedback-summary";
import { MatchPanel } from "@/components/workouts/match-panel";
import { SessionComparisonCard } from "@/components/workouts/session-comparison-card";
import { CoachReviewForm } from "@/components/workouts/coach-review-form";
import { CoachReviewSummary } from "@/components/workouts/coach-review-summary";
import { reviewOfAssignment } from "@/modules/school/application/coach-reviews";
import { loadOpenWaterView } from "@/modules/school/application/open-water-sessions";
import { OpenWaterCard } from "@/components/workouts/open-water-card";
import { PrescriptionReferenceCard, readFrozenReference } from "@/components/workouts/prescription-reference-card";
import { loadFrozenReference } from "@/modules/school/application/athlete-assessments";
import { CancelForConditions } from "@/components/workouts/cancel-for-conditions";
import { REVIEW_STATE_LABELS, reviewState, type ReviewDecision } from "@/modules/school/domain/coach-review";
import { sessionComparison } from "@/modules/school/presentation/session-comparison";
import { plannedTotalsOfRows } from "@/modules/school/domain/workout-structure";
import { loadMatchPanel } from "@/modules/school/application/match-audit";
import { matchPanelModel } from "@/modules/school/presentation/match-panel-model";
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
  const matchPanel = matchPanelModel(await loadMatchPanel(prisma, assignment.id));
  const planned = summarizeWorkoutBlocks(workout?.blocks ?? null);
  // SAM-59 — the chain of versions (already authorized above: `detail` 404s otherwise).
  const chain = await prisma.workoutAssignment.findUnique({
    where: { id: assignment.id },
    select: { workoutId: true, amendmentWorkoutId: true, status: true, scheduledAt: true, schoolId: true, coachId: true },
  });
  const versions = chain ? await prescriptionVersionsOf(prisma, chain) : [];
  // SAM-61 — the athlete's report and the derived execution state (AC12).
  const executionView = chain
    ? await sessionExecutionView(prisma, {
      id: assignment.id, status: chain.status, scheduledAt: chain.scheduledAt, schoolId: chain.schoolId, coachId: chain.coachId,
      hasMatchedExecution: execution !== null, blocks: workout?.blocks ?? [],
    })
    : null;
  // SAM-64 — the review, whether there is something to review, and future sessions it can point at.
  const review = await reviewOfAssignment(prisma, assignment.id, { visibleOnly: false });
  // SAM-65 — open-water context, GPS honesty, comparability and technical task.
  const openWater = await loadOpenWaterView(prisma, assignment.id);
  // SAM-70 — §18.2: the reference frozen with the version in force, and today's sheet as a separate view.
  const versionIds = await prisma.workoutAssignment.findUnique({ where: { id: assignment.id }, select: { workoutId: true, amendmentWorkoutId: true } });
  const versionId = versionIds?.amendmentWorkoutId ?? versionIds?.workoutId ?? null;
  const [versionRow, currentReference] = await Promise.all([
    versionId ? prisma.workout.findUnique({ where: { id: versionId }, select: { snapshotPayload: true } }) : null,
    loadFrozenReference(prisma, context, athleteId),
  ]);
  const frozenReference = readFrozenReference(versionRow?.snapshotPayload ?? null);
  const reviewable = execution !== null || Boolean(executionView?.feedback?.completion);
  const reviewStatus = reviewState({ reviewable, reviewed: review !== null });
  const futureRows = await prisma.workoutAssignment.findMany({
    where: { athleteId, coachId: chain?.coachId ?? undefined, status: { notIn: ["CANCELLED", "RESCHEDULED"] }, scheduledAt: { gt: new Date() }, NOT: { id: assignment.id } },
    orderBy: { scheduledAt: "asc" },
    take: 20,
    select: { id: true, scheduledAt: true, workout: { select: { title: true } } },
  });
  const futureSessions = futureRows.map((row) => ({ id: row.id, label: `${dateLabel(row.scheduledAt)} · ${row.workout?.title ?? "Treino"}` }));
  // SAM-63 — the five questions of the session, each on its own, denominators visible.
  const plannedTotals = plannedTotalsOfRows(workout?.blocks ?? []);
  const comparison = executionView && workout
    ? sessionComparison({
      state: executionView.state,
      prescribed: { sportType: workout.sportType, durationSeconds: plannedTotals.durationSeconds, distanceMeters: plannedTotals.distanceMeters },
      realized: execution ? { sportType: execution.sportType, durationSeconds: execution.durationSeconds, distanceMeters: execution.distanceMeters, source: execution.source, method: null } : null,
      feedback: executionView.feedback,
      coachNote: execution?.evaluation?.note ?? null,
      complianceScore: execution?.compliance?.overallScore ?? null,
      loadMethod: executionView.loadMethod,
    })
    : null;

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
          {/* SAM-59 — a change publishes a new version (with diff); after execution it is an amendment. */}
          {workout && context.isResponsibleCoach && assignment.status !== "CANCELLED" && (
            <Link href={`${hubBasePath(scope, athleteId)}/treinos/${assignment.id}/alterar`} className="glass-button rounded-full px-4 py-2 text-sm font-medium" data-testid="revise-prescription">
              Alterar prescrição
            </Link>
          )}
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
          // SAM-64 — same rule as the evaluation use case: a confirmed or chosen link.
          execution && (execution.matchStatus === "CONFIRMED" || execution.matchStatus === "OVERRIDDEN") ? (
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
        <PrescriptionVersions versions={versions} />
        <div className="mt-4"><PrescriptionReferenceCard frozen={frozenReference} current={currentReference} /></div>
        {openWater && (
          <div className="mt-4 space-y-2">
            <OpenWaterCard view={openWater} audience="coach" />
            {context.isResponsibleCoach && assignment.status !== "CANCELLED" && <CancelForConditions assignmentId={assignment.id} />}
          </div>
        )}
        {comparison && (
          <div className="mt-4">
            <SessionComparisonCard comparison={comparison} />
          </div>
        )}
        {/* SAM-62 — why the activity is linked, confirm/undo/redo/replace/add and the trail. */}
        <div className="mt-4">
          <MatchPanel assignmentId={assignment.id} model={matchPanel} />
        </div>
        {/* SAM-64 — "realizado" and "revisado" are distinct; the review never changes a prescription. */}
        <div className="mt-4 rounded-[18px] border border-white/10 bg-white/5 p-3" data-testid="coach-review">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
              Revisão do professor
              {reviewStatus && <span className="ml-2 normal-case text-foreground/70" data-testid="review-state" data-state={reviewStatus}>· {REVIEW_STATE_LABELS[reviewStatus]}</span>}
            </p>
            {context.isResponsibleCoach && (
              <CoachReviewForm
                target={{ type: "assignment", assignmentId: assignment.id }}
                existing={review ? { ...review, decision: review.decision as ReviewDecision } : null}
                futureSessions={futureSessions}
                disabledReason={reviewable ? null : "Revise depois que houver atividade vinculada ou o relato do aluno."}
              />
            )}
          </div>
          {review ? <CoachReviewSummary review={review} audience="coach" /> : <p className="text-xs text-foreground/55">Ainda não revisada.</p>}
        </div>
        {executionView && (
          <div className="mt-4 rounded-[18px] border border-white/10 bg-white/5 p-3" data-testid="coach-athlete-report">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/55">Relato do aluno</p>
            <SessionFeedbackSummary feedback={executionView.feedback} state={executionView.state} />
            <p className="mt-2 text-[11px] text-foreground/45">Sua observação vai nos comentários ou na avaliação, com seu nome — o relato do aluno não é alterado.</p>
          </div>
        )}
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
