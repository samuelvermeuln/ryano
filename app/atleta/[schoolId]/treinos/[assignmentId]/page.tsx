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
import { formatDuration, formatPace, formatHeartRate, formatPower, formatDistance } from "@/lib/format";
import { FeedbackForm } from "./feedback-form";
import { PushToWatchButton } from "./push-to-watch-button";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; assignmentId: string }> };

const BLOCK_TYPE_LABEL: Record<string, string> = {
  WARMUP: "Aquecimento",
  INTERVAL: "Intervalo",
  STEADY: "Contínuo",
  RECOVERY: "Recuperação",
  COOLDOWN: "Desaquecimento",
  DRILL: "Exercício técnico",
  FREE: "Livre",
  CUSTOM: "Personalizado",
};

const BLOCK_TYPE_EMOJI: Record<string, string> = {
  WARMUP: "🔥", INTERVAL: "⚡", STEADY: "➡️", RECOVERY: "💤",
  COOLDOWN: "❄️", DRILL: "🔄", FREE: "🎯", CUSTOM: "📝",
};

function renderTarget(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const t = payload as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof t.heartRateMin === "number" && typeof t.heartRateMax === "number")
    lines.push(`FC: ${t.heartRateMin}–${t.heartRateMax} bpm`);
  else if (typeof t.heartRate === "number")
    lines.push(`FC: ${t.heartRate} bpm`);
  if (typeof t.power === "number") lines.push(`Potência: ${t.power} W`);
  if (typeof t.paceSecPerKm === "number") {
    const min = Math.floor(t.paceSecPerKm / 60);
    const sec = Math.round(t.paceSecPerKm % 60);
    lines.push(`Pace: ${min}:${String(sec).padStart(2, "0")} /km`);
  }
  if (typeof t.paceSec100m === "number") {
    const min = Math.floor(t.paceSec100m / 60);
    const sec = Math.round(t.paceSec100m % 60);
    lines.push(`Pace nado: ${min}:${String(sec).padStart(2, "0")} /100 m`);
  }
  if (typeof t.zone === "string" || typeof t.zone === "number") lines.push(`Zona ${t.zone}`);
  if (typeof t.rpe === "number") lines.push(`RPE ${t.rpe}/10`);
  return lines;
}

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
          <span className={`shrink-0 text-xs rounded-full px-2.5 py-1 font-medium ${
            assignment.status === "COMPLETED" ? "bg-emerald-500/15 text-emerald-400" :
            assignment.status === "MISSED" ? "bg-destructive/15 text-destructive" :
            "bg-primary/10 text-primary"
          }`}>
            {assignment.status === "COMPLETED" ? "✓ Concluído" :
             assignment.status === "MISSED" ? "Não realizado" :
             assignment.status === "SCHEDULED" ? "Agendado" :
             assignment.status}
          </span>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-foreground/50">
          {assignment.scheduledAt && (
            <span>
              📅 {new Date(assignment.scheduledAt).toLocaleDateString("pt-BR", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </span>
          )}
          {assignment.coach && <span>👤 {assignment.coach.user.name}</span>}
          {targetDurationSeconds != null && <span>⏱ {formatDuration(targetDurationSeconds)}</span>}
          {targetDistanceMeters != null && <span>📏 {formatDistance(targetDistanceMeters)}</span>}
        </div>
      </div>

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
              const targets = renderTarget(block.targetPayload);
              const restTargets = renderTarget(block.restPayload);
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
                    <p className="text-sm text-foreground/60 italic mt-1">"{ev.note}"</p>
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
    </div>
  );
}
