/**
 * SAM-66 — one prova of the athlete, coach side (§6 step 13): the result
 * (official × reported, splits, abandon), goal × result without a success
 * label, the athlete's perception next to the coach's post-event review
 * (separate authors, AC24), and the final action: close the preparation or
 * keep it open with a next review.
 */
import { PreparationPlanSection } from "@/components/events/preparation-plan";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClosePreparationButton } from "@/components/events/close-preparation-button";
import { AgreeGoalForm, AssumePreparationForm } from "@/components/events/preparation-actions";
import { AthleteGoalsPanel } from "@/components/goals/athlete-goals-panel";
import { ListAthleteGoals } from "@/modules/school/application/athlete-goals";
import { prescriptionScope } from "@/modules/school/application/coach-athlete-scope";
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
    // Independent reads in parallel: the remote database makes each round trip count.
    [context, detail] = await Promise.all([
      new ResolveCoachAthleteContext(prisma).execute(session.user.id, scope, athleteId),
      new GetParticipationDetail(prisma).execute(session.user.id, participationId),
    ]);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }
  // SAM-67 — what the coach needs to decide (§6 step 6): goals, other events, history and the current plan.
  const now = new Date();
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: detail.event.timeZone }).format(now);
  const [row, result, goal, preparation, goalPairs, others, recent, upcoming] = await Promise.all([
    prisma.athleteEventParticipation.findUnique({ where: { id: participationId }, select: { athleteId: true } }),
    resultOfParticipation(prisma, participationId),
    goalForResult(prisma, detail.participation),
    detail.preparation ? new GetEventPreparation(prisma).execute(session.user.id, detail.preparation.id).catch(() => null) : Promise.resolve(null),
    new ListAthleteGoals(prisma).execute(session.user.id, athleteId).catch(() => []),
    // Light on purpose: only the future events of this athlete, nothing per row.
    prisma.athleteEventParticipation.findMany({
      where: { athleteId, status: { not: "CANCELLED" }, event: { status: { not: "CANCELLED" }, startLocalDate: { gte: detail.event.startLocalDate < todayIso ? detail.event.startLocalDate : todayIso } } },
      select: { id: true, suggestedPriority: true, agreedPriority: true, event: { select: { name: true, startLocalDate: true } } },
      orderBy: { event: { startLocalDate: "asc" } },
      take: 20,
    }),
    prisma.activity.aggregate({
      // Only within the current follow-up period; earlier spells depend on the athlete's history grant.
      where: { userId: athleteId, duplicateOfActivityId: null, startedAt: { gte: new Date(Math.max(now.getTime() - 28 * 86_400_000, context.periodStart.getTime())) } },
      _count: { _all: true }, _sum: { durationSeconds: true },
    }),
    prisma.workoutAssignment.findMany({
      where: { athleteId, ...prescriptionScope(context), status: { notIn: ["CANCELLED", "RESCHEDULED"] }, scheduledAt: { gte: now, lte: new Date(now.getTime() + 14 * 86_400_000) } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      select: { id: true, scheduledAt: true, workout: { select: { title: true } } },
    }),
  ]);
  if (row?.athleteId !== athleteId) notFound();
  const reviews = preparation
    ? await prisma.coachReview.findMany({
      // SAM-71 — milestone decisions are shown on their milestone, not as the post-event review.
      where: { eventPreparationId: preparation.id, targetType: "PREPARATION" },
      orderBy: { createdAt: "desc" },
      select: { id: true, observation: true, decision: true, justification: true, nextReviewLocalDate: true, linkedAssignmentIds: true, isVisible: true, version: true, updatedAt: true, author: { select: { name: true } } },
    })
    : [];
  const responsible = preparation?.role === "responsible";
  const started = detail.past || (detail.daysUntil !== null && detail.daysUntil <= 0);  const pairs = goalPairs.filter((pair) => pair.desired?.participationId === participationId || pair.agreed.some((goal) => goal.participationId === participationId));
  const desiredGoalId = pairs.find((pair) => pair.desired)?.desired?.id ?? null;
  const isMain = (item: (typeof others)[number]) => (item.agreedPriority ?? item.suggestedPriority) === "MAIN";
  const current = others.find((item) => item.id === participationId);
  const otherEvents = others.filter((item) => item.id !== participationId);
  // §5.5 — two main provas close together are a conversation with the athlete, not a block.
  const otherMain = current && isMain(current) ? otherEvents.filter(isMain) : [];
  const canAssume = preparation !== null && (preparation.role === "responsible" || preparation.role === "collaborator") && ["UNASSIGNED", "AWAITING_ASSESSMENT"].includes(preparation.status);

  return (
    <AthleteHubShell scope={scope} athlete={context.athlete} teams={context.teams} currentCoach={context.currentCoach} isResponsibleCoach={context.isResponsibleCoach} active="eventos">
      <Link href={athleteHubHref(scope, athleteId, "eventos")} className="text-xs text-foreground/60 hover:underline">← Eventos do aluno</Link>
      <SectionCard
        title={`${detail.event.name}${detail.option ? ` · ${detail.option.label}` : ""}`}
        description={`${formatLocal(detail.event.startLocalDate)} · ${detail.past ? "evento realizado" : detail.daysUntil === null ? "data a confirmar" : `faltam ${detail.daysUntil} dia(s)`}`}
      >
        <div className="space-y-1 text-sm" data-testid="coach-event-summary">
          <p data-testid="coach-event-preparation" data-status={preparation?.status ?? "NONE"}>
            Acompanhamento: {preparation ? PREPARATION_STATUS_LABELS[preparation.status as keyof typeof PREPARATION_STATUS_LABELS] ?? preparation.status : "sem acompanhamento"}
          </p>
          <p>Data: {formatLocal(detail.event.startLocalDate)}{detail.event.endLocalDate ? ` a ${formatLocal(detail.event.endLocalDate)}` : ""} · fuso {detail.event.timeZone}</p>
          <p data-testid="coach-event-countdown">Prazo restante: {detail.past ? "evento realizado" : detail.daysUntil === null ? "data a confirmar" : `${detail.daysUntil} dia(s)`}</p>
          {detail.option && <p>Prova: {detail.option.label}</p>}
        </div>
        {canAssume && preparation && (
          <div className="mt-3"><AssumePreparationForm preparationId={preparation.id} expectedVersion={preparation.version} /></div>
        )}
      </SectionCard>

      <SectionCard title="Objetivos" description="O desejado pelo aluno continua visível quando você pactua outro.">
        <p className="text-sm"><span className="text-foreground/55">Desejado no cadastro: </span>{detail.participation.goalText ?? "—"}</p>
        <div className="mt-3"><AthleteGoalsPanel pairs={pairs} /></div>
        {responsible && <div className="mt-3"><AgreeGoalForm athleteId={athleteId} participationId={participationId} desiredGoalId={desiredGoalId} /></div>}
      </SectionCard>

      {preparation && (
        <SectionCard title="Preparação" description="Fases, marcos verificáveis e sessões ligadas a este evento. Nada é gerado automaticamente.">
          <PreparationPlanSection viewerId={session.user.id} preparationId={preparation.id} timeZone={detail.event.timeZone} />
        </SectionCard>
      )}

      <SectionCard title="Contexto do aluno" description="Outros eventos, histórico disponível e planejamento atual.">
        <div className="grid gap-4 sm:grid-cols-3 text-sm">
          <div data-testid="coach-event-others">
            <p className="text-xs uppercase tracking-wide text-foreground/50">Outros eventos</p>
            {otherEvents.length === 0 ? <p className="text-foreground/60">Nenhum outro evento futuro.</p> : (
              <ul>{otherEvents.map((item) => <li key={item.id}>{item.event.name} · {formatLocal(item.event.startLocalDate)}</li>)}</ul>
            )}
            {otherMain.length > 0 && (
              <p className="mt-1 text-xs text-amber-300">Mais de uma prova principal próxima: {otherMain.map((item) => item.event.name).join(", ")}. Combine prioridades com o aluno (§5.5).</p>
            )}
          </div>
          <div data-testid="coach-event-history">
            <p className="text-xs uppercase tracking-wide text-foreground/50">Últimas 4 semanas</p>
            <p>{recent._count._all} atividade(s){recent._sum.durationSeconds ? ` · ${Math.round(recent._sum.durationSeconds / 3600)} h` : ""}</p>
            <p className="text-[11px] text-foreground/50">Dentro do acompanhamento atual; períodos anteriores dependem da autorização do aluno.</p>
            <Link href={athleteHubHref(scope, athleteId, "analise")} className="text-xs underline">Abrir análise</Link>
          </div>
          <div data-testid="coach-event-plan">
            <p className="text-xs uppercase tracking-wide text-foreground/50">Próximos 14 dias</p>
            {upcoming.length === 0 ? <p className="text-foreground/60">Nenhuma sessão prescrita.</p> : (
              <ul>{upcoming.map((row) => <li key={row.id}><Link className="hover:underline" href={`${athleteHubHref(scope, athleteId, "treinos")}/${row.id}`}>{row.workout?.title ?? "Treino"}</Link></li>)}</ul>
            )}
          </div>
        </div>
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
