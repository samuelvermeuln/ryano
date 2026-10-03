/**
 * T295 — Detalhe do treino (visão do atleta)
 * T296 — Prescrito × Realizado
 * T297 — Formulário de feedback
 * FASE 3 — Blocos com alvos (pace, HR, watts, distância, repetições)
 *
 * SAM-30 — the body is shared by the school route and by `/app/treinos/[id]`
 * (independent coaching); each page keeps its own query guards and tells the
 * view where "back" goes, which zone to read the schedule in and which levers
 * exist (change requests are school-only; comments work everywhere).
 */
import Link from "next/link";
import { humanizeActivityLabel } from "@/lib/activity-text";
import { formatDuration, formatHeartRate, formatPower, formatDistance } from "@/lib/format";
import { plannedTotalsOfRows } from "@/modules/school/domain/workout-structure";
import { formatScheduledLong } from "@/modules/school/presentation/format";
import {
  BLOCK_TYPE_EMOJI,
  BLOCK_TYPE_LABEL,
  describeBlockTargets,
} from "@/modules/school/presentation/workout-blocks";
import { ASSIGNMENT_STATUS_LABELS } from "@/modules/school/presentation/workout-labels";
import { WorkoutCommentsThread } from "@/components/school/workout-comments-thread";
import { PrescriptionVersions } from "@/components/workouts/prescription-versions";
import type { PrescriptionVersionView } from "@/modules/school/application/prescription-revisions";
import { SessionFeedbackForm } from "@/components/workouts/session-feedback-form";
import { SessionFeedbackSummary, type SessionFeedbackView } from "@/components/workouts/session-feedback-summary";
import type { ExecutionState } from "@/modules/school/domain/execution-state";
import { combineExecutions } from "@/modules/school/domain/execution-combination";
import type { MatchPanelModel } from "@/modules/school/presentation/match-panel-model";
import { MatchPanel } from "@/components/workouts/match-panel";
import { SessionComparisonCard } from "@/components/workouts/session-comparison-card";
import { CoachReviewSummary, type CoachReviewView } from "@/components/workouts/coach-review-summary";
import { OpenWaterCard } from "@/components/workouts/open-water-card";
import { SessionV2View } from "@/components/workouts/session-v2-view";
import { PrescriptionReferenceCard, readFrozenReference } from "@/components/workouts/prescription-reference-card";
import { sessionContentV2Schema } from "@/modules/school/domain/session-content-v2";
import type { OpenWaterView } from "@/modules/school/application/open-water-sessions";
import { sessionComparison, type SessionLoadMethod } from "@/modules/school/presentation/session-comparison";
import { PushToWatchButton } from "./push-to-watch-button";
import { WorkoutActions } from "./workout-actions";
import type { AthleteWorkoutDetail } from "./workout-detail-query";

export function AthleteWorkoutDetailView({
  assignment,
  viewerId,
  backHref,
  backLabel,
  timeZone,
  canRequestChange,
  canPushToWatch,
  versions = [],
  executionView = null,
  matchPanel = null,
  review = null,
  openWater = null,
}: {
  /** Already guarded by the page: the viewer's own assignment, with a workout. */
  assignment: AthleteWorkoutDetail & { workout: NonNullable<AthleteWorkoutDetail["workout"]> };
  viewerId: string;
  backHref: string;
  backLabel: string;
  /** IANA zone the scheduled time is shown in (school's, or the athlete's). */
  timeZone: string;
  canRequestChange: boolean;
  canPushToWatch: boolean;
  /** SAM-59 — the prescription's versions (received, replaced, amendment). */
  versions?: PrescriptionVersionView[];
  /** SAM-61 — report, derived execution state and whether RPE was asked. */
  executionView?: { feedback: SessionFeedbackView | null; state: ExecutionState; rpeRequested: boolean; loadMethod: SessionLoadMethod } | null;
  /** SAM-62 — links with their explanation, actions and trail. */
  matchPanel?: MatchPanelModel | null;
  /** SAM-64 — the coach's review, only when visible to the athlete. */
  review?: CoachReviewView | null;
  /** SAM-65 — open-water context and analysis, when it is an open-water session. */
  openWater?: OpenWaterView | null;
}) {
  const assignmentId = assignment.id;
  // SAM-69 — a v2 prescription carries its structure in the immutable snapshot.
  const sessionV2 = (() => {
    const raw = (assignment.workout.snapshotPayload as { content?: { session?: unknown } } | null)?.content?.session;
    const parsed = raw ? sessionContentV2Schema.safeParse(raw) : null;
    return parsed?.success ? parsed.data : null;
  })();
  // SAM-62 — several files of one session add up once; per-session metrics come from the first piece.
  const combined = combineExecutions(assignment.executions);
  const exec = combined ? { ...combined.primary, durationSeconds: combined.durationSeconds, distanceMeters: combined.distanceMeters } : null;
  const blocks = assignment.workout.blocks;
  // SAM-48 — repetitions and rest count, as on every other screen.
  const totals = plannedTotalsOfRows(blocks);
  const targetDurationSeconds = totals.durationSeconds;
  const targetDistanceMeters = totals.distanceMeters;
  // SAM-63 — the five questions, each on its own, with the denominators visible.
  const comparison = executionView
    ? sessionComparison({
      state: executionView.state,
      prescribed: { sportType: assignment.workout.sportType, durationSeconds: targetDurationSeconds, distanceMeters: targetDistanceMeters },
      realized: exec ? { sportType: exec.sportType, durationSeconds: exec.durationSeconds, distanceMeters: exec.distanceMeters, source: exec.source, method: exec.matchMethod } : null,
      feedback: executionView.feedback,
      coachNote: exec?.evaluations[0]?.note ?? null,
      complianceScore: exec?.compliance?.overallScore ?? null,
      loadMethod: executionView.loadMethod,
    })
    : null;

  // SAM-27 — the athlete's levers on this prescription.
  const openChangeRequest = assignment.changeRequests[0] ?? null;
  const openReviewRequest = assignment.comments.some((c) => c.kind === "REVIEW_REQUEST" && c.resolvedAt === null);
  const comments = assignment.comments.map((comment) => ({
    id: comment.id,
    kind: comment.kind as "COMMENT" | "REVIEW_REQUEST",
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    resolvedAt: comment.resolvedAt?.toISOString() ?? null,
    author: comment.author,
  }));

  return (
    <div className="p-4 md:p-8 max-w-2xl space-y-6">
      {/* Back */}
      <Link
        href={backHref}
        className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors"
      >
        ← {backLabel}
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{assignment.workout.title}</h1>
            <p className="text-sm text-foreground/50 capitalize mt-0.5">
              {humanizeActivityLabel(assignment.workout.sportType) ?? assignment.workout.sportType}
            </p>
          </div>
          {/* Status badge */}
          <span data-testid="assignment-status" className={`shrink-0 text-xs rounded-full px-2.5 py-1 font-medium ${
            assignment.status === "COMPLETED" ? "bg-emerald-500/15 text-emerald-400" :
            assignment.status === "MISSED" ? "bg-destructive/15 text-destructive" :
            "bg-primary/10 text-primary"
          }`}>
            {assignment.status === "COMPLETED"
              ? "✓ Concluído"
              : ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status}
          </span>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-foreground/50">
          {assignment.scheduledAt && (
            <span data-testid="scheduled-at">
              📅 {formatScheduledLong(assignment.scheduledAt, timeZone)}
            </span>
          )}
          {assignment.coach && <span>👤 {assignment.coach.displayName ?? assignment.coach.user.name}</span>}
          {targetDurationSeconds != null && <span>⏱ {formatDuration(targetDurationSeconds)}</span>}
          {targetDistanceMeters != null && <span>📏 {formatDistance(targetDistanceMeters)}</span>}
        </div>
      </div>

      {/* SAM-27 — ask for a change, ask for a review, report an absence. */}
      <WorkoutActions
        assignmentId={assignmentId}
        status={assignment.status}
        hasExecution={exec !== null}
        canRequestChange={canRequestChange}
        openChangeRequest={openChangeRequest}
        openReviewRequest={openReviewRequest}
      />

      {/* Push to watch */}
      {canPushToWatch && (
        <PushToWatchButton assignmentId={assignmentId} />
      )}
      {assignment.garminPushStatus === "PUSHED" && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
          <span>✓</span>
          <span>Treino enviado ao relógio Garmin</span>
          {assignment.garminPushedAt && (
            <span className="text-foreground/40 ml-auto">
              {new Date(assignment.garminPushedAt).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {assignment.workout.description && (
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-sm space-y-1">
          <p className="font-medium text-xs text-foreground/40 uppercase tracking-wide">Descrição</p>
          <p className="whitespace-pre-line text-foreground/80">{assignment.workout.description}</p>
        </section>
      )}

      {/* Workout blocks — FASE 3 */}
      {blocks.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider">Estrutura do treino</h2>
          <div className="space-y-2">
            {blocks.map((block, idx) => {
              const targets = describeBlockTargets(block.targetPayload);
              const restTargets = describeBlockTargets(block.restPayload);
              return (
                <div
                  key={block.id}
                  className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 space-y-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{BLOCK_TYPE_EMOJI[block.blockType] ?? "▶"}</span>
                    <span className="text-xs font-semibold text-foreground/70">
                      {block.repetitions && block.repetitions > 1
                        ? `${block.repetitions}× `
                        : ""
                      }
                      {block.title ?? BLOCK_TYPE_LABEL[block.blockType] ?? block.blockType}
                    </span>
                    <span className="ml-auto text-xs text-foreground/30">#{idx + 1}</span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-foreground/50">
                    {block.durationS != null && <span>⏱ {formatDuration(block.durationS)}</span>}
                    {block.distanceM != null && <span>📏 {formatDistance(Number(block.distanceM))}</span>}
                    {block.repetitions != null && block.repetitions > 1 && <span>🔁 {block.repetitions}×</span>}
                  </div>

                  {targets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {targets.map((t) => (
                        <span key={t} className="text-xs rounded-lg bg-primary/10 text-primary px-2 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {restTargets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-foreground/30">Descanso:</span>
                      {restTargets.map((t) => (
                        <span key={t} className="text-xs rounded-lg bg-white/5 text-foreground/50 px-2 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* T296 — Prescrito × Realizado */}
      {exec && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider">Prescrito × Realizado</h2>
          <div className="rounded-2xl border border-white/8 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03]">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-foreground/40">Dimensão</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-foreground/40">Prescrito</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-foreground/40">Realizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="px-4 py-2.5 text-foreground/70">Modalidade</td>
                  <td className="px-4 py-2.5 text-right text-foreground/70 capitalize">
                    {humanizeActivityLabel(assignment.workout.sportType) ?? assignment.workout.sportType}
                  </td>
                  <td className="px-4 py-2.5 text-right capitalize">
                    {humanizeActivityLabel(exec.sportType) ?? exec.sportType}
                  </td>
                </tr>
                {(targetDistanceMeters != null || exec.distanceMeters != null) && (
                  <tr>
                    <td className="px-4 py-2.5 text-foreground/70">Distância</td>
                    <td className="px-4 py-2.5 text-right text-foreground/70">
                      {targetDistanceMeters != null ? formatDistance(targetDistanceMeters) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {exec.distanceMeters != null ? formatDistance(exec.distanceMeters) : "—"}
                    </td>
                  </tr>
                )}
                {(targetDurationSeconds != null || exec.durationSeconds != null) && (
                  <tr>
                    <td className="px-4 py-2.5 text-foreground/70">Duração</td>
                    <td className="px-4 py-2.5 text-right text-foreground/70">
                      {targetDurationSeconds != null ? formatDuration(targetDurationSeconds) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {exec.durationSeconds != null ? formatDuration(exec.durationSeconds) : "—"}
                    </td>
                  </tr>
                )}
                {exec.averageHeartRate != null && (
                  <tr>
                    <td className="px-4 py-2.5 text-foreground/70">FC média</td>
                    <td className="px-4 py-2.5 text-right text-foreground/70">—</td>
                    <td className="px-4 py-2.5 text-right">{formatHeartRate(exec.averageHeartRate)}</td>
                  </tr>
                )}
                {exec.averagePower != null && (
                  <tr>
                    <td className="px-4 py-2.5 text-foreground/70">Potência média</td>
                    <td className="px-4 py-2.5 text-right text-foreground/70">—</td>
                    <td className="px-4 py-2.5 text-right">{formatPower(exec.averagePower)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Compliance */}
          {exec.compliance && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground/40 uppercase tracking-wide">Compliance Ryvano</p>
                <p className="font-bold tabular-nums text-2xl">
                  {(exec.compliance.overallScore / 10).toFixed(1)}
                  <span className="text-foreground/30 text-sm font-normal">/10</span>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(exec.compliance.breakdown as Record<string, number>).map(([dim, score]) => (
                  <div key={dim} className="text-center rounded-xl bg-white/[0.04] py-2.5">
                    <p className="text-sm font-semibold tabular-nums">{(score / 10).toFixed(1)}</p>
                    <p className="text-xs text-foreground/40 capitalize mt-0.5">{dim}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coach evaluation */}
          {exec.evaluations.length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 space-y-2">
              <p className="text-xs font-semibold text-foreground/40 uppercase tracking-wide">Avaliação do professor</p>
              {exec.evaluations.map((ev, i) => (
                <div key={i}>
                  <p className="font-bold text-xl tabular-nums">
                    {(ev.overallScore / 10).toFixed(1)}
                    <span className="text-sm font-normal text-foreground/30">/10</span>
                  </p>
                  {ev.note && (
                    <p className="text-sm text-foreground/60 italic mt-1">&ldquo;{ev.note}&rdquo;</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {sessionV2 && <SessionV2View content={sessionV2} title={assignment.workout.title} />}

      <PrescriptionReferenceCard frozen={readFrozenReference(assignment.workout.snapshotPayload)} />

      {openWater && <OpenWaterCard view={openWater} audience="athlete" />}

      {comparison && <SessionComparisonCard comparison={comparison} />}

      {matchPanel && <MatchPanel assignmentId={assignmentId} model={matchPanel} />}

      {review && (
        <section className="space-y-2" data-testid="athlete-coach-review">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Parecer do professor</h2>
          <CoachReviewSummary review={review} audience="athlete" />
        </section>
      )}

      {/* SAM-61 — the athlete's report: with or without a synced execution (manual record, "não realizei"). */}
      {executionView && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider">Seu relato</h2>
          <SessionFeedbackSummary feedback={executionView.feedback} state={executionView.state} />
          {assignment.status !== "CANCELLED" && executionView.state !== "FUTURE" && (
            <SessionFeedbackForm
              assignmentId={assignmentId}
              existing={executionView.feedback ? {
                completion: executionView.feedback.completion as "FULL" | "PARTIAL" | "NOT_DONE" | null,
                rpe: executionView.feedback.rpe, difficulty: executionView.feedback.difficulty,
                adaptationReason: executionView.feedback.adaptationReason, adaptationNote: executionView.feedback.adaptationNote,
                painReported: executionView.feedback.painReported, painNote: executionView.feedback.painNote,
                comment: executionView.feedback.comment, attachmentUrl: executionView.feedback.attachmentUrl,
              } : null}
              rpeRequested={executionView.rpeRequested}
              hasExecution={exec !== null}
              openWater={openWater !== null}
            />
          )}
          {!exec && (
            <p className="text-xs text-foreground/40">
              Sem atividade sincronizada ainda. Se treinou sem relógio, registre acima; se o relógio ainda vai sincronizar, aguarde.
            </p>
          )}
        </section>
      )}

      {/* SAM-27 — conversation with the coach about this prescription. */}
      <PrescriptionVersions versions={versions} />

      <section className="space-y-3" id="comentarios">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider">Comentários</h2>
        {/* AC19 / ADR-009 — the athlete never edits the prescription; outside a school the request goes to the coach here. */}
        {!canRequestChange && (
          <p className="text-xs text-foreground/60" data-testid="request-change-by-comment">
            Solicitar alteração: escreva ao seu professor aqui nos comentários — só ele altera a prescrição.
          </p>
        )}
        <WorkoutCommentsThread assignmentId={assignmentId} comments={comments} viewerId={viewerId} />
      </section>
    </div>
  );
}
