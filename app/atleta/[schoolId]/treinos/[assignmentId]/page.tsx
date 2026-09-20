/**
 * T295 — Detalhe do treino (visão do atleta)
 * T296 — Prescrito × Realizado
 * T297 — Formulário de feedback (via FeedbackForm client component)
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { FeedbackForm } from "./feedback-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; assignmentId: string }> };

export default async function WorkoutDetailPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, assignmentId } = await params;

  const assignment = await prisma.workoutAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      workout: { include: { blocks: { select: { durationS: true, distanceM: true } } } },
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
  });

  if (!assignment || assignment.athleteId !== session.user.id || assignment.schoolId !== schoolId) notFound();

  const exec = assignment.executions[0] ?? null;
  const targetDurationSeconds = assignment.workout.blocks.reduce((s, b) => s + (b.durationS ?? 0), 0) || null;
  const targetDistanceMeters = assignment.workout.blocks.reduce((s, b) => s + Number(b.distanceM ?? 0), 0) || null;

  return (
    <div className="p-6 md:p-10 max-w-xl space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{assignment.workout.title}</h1>
        <p className="text-xs text-muted-foreground capitalize">{assignment.workout.sportType}</p>
        {assignment.scheduledAt && (
          <p className="text-xs text-muted-foreground">
            Agendado: {new Date(assignment.scheduledAt).toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        )}
        {assignment.coach && (
          <p className="text-xs text-muted-foreground">Coach: {assignment.coach.user.name}</p>
        )}
      </div>

      {/* Workout description */}
      {assignment.workout.description && (
        <section className="rounded-xl border border-border bg-card p-4 text-sm space-y-1">
          <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Descrição</p>
          <p className="whitespace-pre-line">{assignment.workout.description}</p>
        </section>
      )}

      {/* T296 — Prescrito × Realizado */}
      {exec && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Prescrito × Realizado</h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Dimensão</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Prescrito</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Realizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-2.5">Modalidade</td>
                  <td className="px-4 py-2.5 text-right capitalize">{assignment.workout.sportType}</td>
                  <td className="px-4 py-2.5 text-right capitalize">{exec.sportType}</td>
                </tr>
                {(targetDistanceMeters != null || exec.distanceMeters != null) && (
                  <tr>
                    <td className="px-4 py-2.5">Distância (km)</td>
                    <td className="px-4 py-2.5 text-right">
                      {targetDistanceMeters != null
                        ? (targetDistanceMeters / 1000).toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {exec.distanceMeters != null ? (exec.distanceMeters / 1000).toFixed(2) : "—"}
                    </td>
                  </tr>
                )}
                {(targetDurationSeconds != null || exec.durationSeconds != null) && (
                  <tr>
                    <td className="px-4 py-2.5">Duração (min)</td>
                    <td className="px-4 py-2.5 text-right">
                      {targetDurationSeconds != null
                        ? Math.round(targetDurationSeconds / 60) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {exec.durationSeconds != null ? Math.round(exec.durationSeconds / 60) : "—"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Compliance */}
          {exec.compliance && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Compliance Ryvano</p>
                <p className="font-bold tabular-nums text-lg">
                  {(exec.compliance.overallScore / 10).toFixed(1)}
                  <span className="text-muted-foreground text-xs font-normal">/10</span>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(exec.compliance.breakdown as Record<string, number>).map(([dim, score]) => (
                  <div key={dim} className="text-center rounded-lg bg-muted/40 py-2">
                    <p className="text-sm font-semibold tabular-nums">{(score / 10).toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground capitalize">{dim}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coach evaluation */}
          {exec.evaluations.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Avaliação do professor</p>
              {exec.evaluations.map((ev, i) => (
                <div key={i}>
                  <p className="font-bold text-lg tabular-nums">
                    {(ev.overallScore / 10).toFixed(1)}<span className="text-xs font-normal text-muted-foreground">/10</span>
                  </p>
                  {ev.note && <p className="text-sm text-muted-foreground italic">"{ev.note}"</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* T297 — Formulário de feedback */}
      {exec && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Seu feedback</h2>
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
        <p className="text-sm text-muted-foreground">Nenhuma execução registrada ainda. O matching ocorre automaticamente após a atividade ser importada.</p>
      )}
    </div>
  );
}
