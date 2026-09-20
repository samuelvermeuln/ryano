/**
 * T279 — Formulário de avaliação do coach
 * Route: /professor/[schoolId]/atletas/[athleteId]/avaliar?execId=[id]
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { EvaluationForm } from "./evaluation-form";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string }>;
  searchParams: Promise<{ execId?: string }>;
};

export default async function AvaliarPage({ params, searchParams }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, athleteId } = await params;
  const { execId } = await searchParams;
  if (!execId) notFound();

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!coachProfile) notFound();

  const execution = await prisma.workoutExecution.findUnique({
    where: { id: execId },
    include: {
      assignment: { include: { workout: { select: { title: true } } } },
      evaluations: { where: { coachId: coachProfile.id }, select: { id: true, overallScore: true, note: true, isVisible: true } },
    },
  });
  if (!execution || execution.athleteId !== athleteId) notFound();

  const existing = execution.evaluations[0] ?? null;

  return (
    <div className="p-6 md:p-10 max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Avaliar execução</h1>
        <p className="text-sm text-muted-foreground mt-1">{execution.assignment.workout?.title ?? "Treino"}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(execution.startedAt).toLocaleDateString("pt-BR")} · {execution.sportType}
        </p>
      </div>

      <EvaluationForm
        executionId={execId}
        schoolId={schoolId}
        athleteId={athleteId}
        existing={existing}
      />
    </div>
  );
}
