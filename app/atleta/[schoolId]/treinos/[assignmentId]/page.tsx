/**
 * T295 — Detalhe do treino (visão do atleta)
 * T296 — Prescrito × Realizado
 * T297 — Formulário de feedback
 * FASE 3 — Blocos com alvos (pace, HR, watts, distância, repetições)
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { humanizeActivityLabel } from "@/lib/activity-text";
import { formatDuration, formatHeartRate, formatPower, formatDistance } from "@/lib/format";
import { formatScheduledLong } from "@/modules/school/presentation/format";
import {
  BLOCK_TYPE_EMOJI,
  BLOCK_TYPE_LABEL,
  describeBlockTargets,
} from "@/modules/school/presentation/workout-blocks";
import { ASSIGNMENT_STATUS_LABELS } from "@/modules/school/presentation/workout-labels";
import { WorkoutCommentsThread } from "@/components/school/workout-comments-thread";
import { FeedbackForm } from "./feedback-form";
import { PushToWatchButton } from "./push-to-watch-button";
import { WorkoutActions } from "./workout-actions";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; assignmentId: string }> };

export default async function WorkoutDetailPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, assignmentId } = await params;

  const [assignment, hasGarmin] = await Promise.all([
    prisma.workoutAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        workout: {
          include: {
            blocks: {
              orderBy: { position: "asc" },
              select: {
                id: true, blockType: true, title: true,
                durationS: true, distanceM: true, repetitions: true,
                targetPayload: true, restPayload: true,
              },
            },
          },
        },
        executions: {
          where: { matchStatus: { in: ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] } },
          include: {
            compliance: true,
            feedback: true,
            evaluations: {
              where: { isVisible: true },
              select: { overallScore: true, note: true, createdAt: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        coach: { include: { user: { select: { name: true } } } },
        // SAM-16 — the scheduled time reads in the school's zone, the same clock the coach typed it in.
        school: { select: { timezone: true } },
        // SAM-27 — what the athlete already asked for, so the screen never offers it twice.
        changeRequests: {
          where: { status: { in: ["PENDING", "ACKNOWLEDGED"] } },
          select: { status: true, reason: true },
          take: 1,
        },
        comments: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 100,
          select: {
            id: true, kind: true, body: true, createdAt: true, resolvedAt: true,
            author: { select: { id: true, name: true, image: true } },
          },
        },
      },
    }),
    prisma.wearableConnection.findFirst({
      where: { userId: session.user.id, provider: "GARMIN", status: "CONNECTED" },
      select: { id: true },
    }),
  ]);

  if (!assignment || assignment.athleteId !== session.user.id || assignment.schoolId !== schoolId) notFound();
  if (!assignment.workout) notFound();

  const exec = assignment.executions[0] ?? null;
  const blocks = assignment.workout.blocks;
  const targetDurationSeconds = blocks.reduce((s, b) => s + (b.durationS ?? 0), 0) || null;
  const targetDistanceMeters = blocks.reduce((s, b) => s + Number(b.distanceM ?? 0), 0) || null;

  const canPushToWatch = !!hasGarmin &&
    ["SCHEDULED", "AVAILABLE"].includes(assignment.status) &&
    assignment.garminPushStatus !== "PUSHED";

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
        href={`/atleta/${schoolId}/calendario`}
        className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors"
      >
        ← Calendário
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
              📅 {formatScheduledLong(assignment.scheduledAt, assignment.school?.timezone ?? "America/Sao_Paulo")}
            </span>
          )}
          {assignment.coach && <span>👤 {assignment.coach.user.name}</span>}
          {targetDurationSeconds != null && <span>⏱ {formatDuration(targetDurationSeconds)}</span>}
          {targetDistanceMeters != null && <span>📏 {formatDistance(targetDistanceMeters)}</span>}
        </div>
      </div>

      {/* SAM-27 — ask for a change, ask for a review, report an absence. */}
      <WorkoutActions
        assignmentId={assignmentId}
        status={assignment.status}
        hasExecution={exec !== null}
        canRequestChange={assignment.coachId !== null}
        openChangeRequest={openChangeRequest}
        openReviewRequest={openReviewRequest}
      />

      {/* Push to watch */}
      {canPushToWatch && (
        <PushToWatchButton assignmentId={assignmentId} schoolId={schoolId} />
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

      {/* T297 — Feedback */}
      {exec && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider">Seu feedback</h2>
          <FeedbackForm
            executionId={exec.id}
            existing={exec.feedback ? {
              rpe: exec.feedback.rpe,
              mood: exec.feedback.mood,
              energy: exec.feedback.energy,
              comment: exec.feedback.comment,
            } : null}
            schoolId={schoolId}
            assignmentId={assignmentId}
          />
        </section>
      )}

      {!exec && (
        <p className="text-xs text-foreground/40 pt-2">
          Nenhuma execução registrada ainda. O matching ocorre automaticamente após a atividade ser importada pelo Garmin.
        </p>
      )}

      {/* SAM-27 — conversation with the coach about this prescription. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider">Comentários</h2>
        <WorkoutCommentsThread assignmentId={assignmentId} comments={comments} viewerId={session.user.id} />
      </section>
    </div>
  );
}
