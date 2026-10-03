/**
 * SAM-66 — one prova of the athlete, coach side (§6 step 13): the result
 * (official × reported, splits, abandon), goal × result without a success
 * label, the athlete's perception next to the coach's post-event review
 * (separate authors, AC24), and the final action: close the preparation or
 * keep it open with a next review.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClosePreparationButton } from "@/components/events/close-preparation-button";
import { ParticipationResultForm } from "@/components/events/participation-result-form";
import { ParticipationResultSummary } from "@/components/events/participation-result-summary";
import { SectionCard } from "@/components/section-card";
import { CoachReviewForm } from "@/components/workouts/coach-review-form";
import { CoachReviewSummary } from "@/components/workouts/coach-review-summary";
import { GetEventPreparation } from "@/modules/school/application/event-preparations";
import { GetParticipationDetail } from "@/modules/school/application/participation-detail";
import { goalForResult, resultOfParticipation } from "@/modules/school/application/participation-results";
import { ResolveCoachAthleteContext } from "@/modules/school/application/resolve-coach-athlete-context";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { PREPARATION_STATUS_LABELS } from "@/modules/school/domain/event-preparation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell } from "./athlete-hub-shell";
import { athleteHubHref, type CoachAthleteScope } from "./hub-scope";

const formatLocal = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

export async function EventScreen({ scope, athleteId, participationId }: { scope: CoachAthleteScope; athleteId: string; participationId: string }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  let context;
  let detail;
  try {
    context = await new ResolveCoachAthleteContext(prisma).execute(session.user.id, scope, athleteId);
    detail = await new GetParticipationDetail(prisma).execute(session.user.id, participationId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }
  const row = await prisma.athleteEventParticipation.findUnique({ where: { id: participationId }, select: { athleteId: true } });
  if (row?.athleteId !== athleteId) notFound();

  const [result, goal] = await Promise.all([resultOfParticipation(prisma, participationId), goalForResult(prisma, detail.participation)]);
  const preparation = detail.preparation
    ? await new GetEventPreparation(prisma).execute(session.user.id, detail.preparation.id).catch(() => null)
    : null;
  const reviews = preparation
    ? await prisma.coachReview.findMany({
      where: { eventPreparationId: preparation.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, observation: true, decision: true, justification: true, nextReviewLocalDate: true, linkedAssignmentIds: true, isVisible: true, version: true, updatedAt: true, author: { select: { name: true } } },
    })
    : [];
  const responsible = preparation?.role === "responsible";
  const started = detail.past || (detail.daysUntil !== null && detail.daysUntil <= 0);

  return (
    <AthleteHubShell scope={scope} athlete={context.athlete} teams={context.teams} currentCoach={context.currentCoach} isResponsibleCoach={context.isResponsibleCoach} active="eventos">
      <Link href={athleteHubHref(scope, athleteId, "eventos")} className="text-xs text-foreground/60 hover:underline">← Eventos do aluno</Link>
      <SectionCard
        title={`${detail.event.name}${detail.option ? ` · ${detail.option.label}` : ""}`}
        description={`${formatLocal(detail.event.startLocalDate)} · ${detail.past ? "evento realizado" : detail.daysUntil === null ? "data a confirmar" : `faltam ${detail.daysUntil} dia(s)`}`}
      >
        <p className="text-sm" data-testid="coach-event-preparation" data-status={preparation?.status ?? "NONE"}>
          Acompanhamento: {preparation ? PREPARATION_STATUS_LABELS[preparation.status as keyof typeof PREPARATION_STATUS_LABELS] ?? preparation.status : "sem acompanhamento"}
        </p>
      </SectionCard>

      <SectionCard title="Resultado" description="Tempo oficial e relatado com a origem; a percepção do aluno é dele.">
        <div className="space-y-5">
          <ParticipationResultSummary result={result} goalText={goal} />
          {started && <ParticipationResultForm participationId={participationId} existing={result} audience="coach" />}
        </div>
      </SectionCard>

      {preparation && (
        <SectionCard title="Parecer pós-evento" description="Sua leitura do resultado, separada do relato do aluno. Salvar não altera treino.">
          <div className="space-y-3" data-testid="preparation-reviews">
            {reviews.length === 0 ? <p className="text-sm text-foreground/60">Sem parecer ainda.</p> : reviews.map((review) => <CoachReviewSummary key={review.id} review={review} audience="coach" />)}
            {responsible && preparation.status !== "CLOSED" && (
              <div className="flex flex-wrap gap-2">
                <CoachReviewForm target={{ type: "preparation", preparationId: preparation.id }} existing={null} futureSessions={[]} disabledReason={null} />
                <ClosePreparationButton preparationId={preparation.id} expectedVersion={preparation.version} />
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </AthleteHubShell>
  );
}
