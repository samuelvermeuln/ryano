/**
 * SAM-11 — Resumo do atleta (central do professor).
 *
 * Supersedes the read-only T272/T277/T278/T280 listing that used to live here:
 * the prescription list, the charts, the technical sheet and the interaction
 * trail each moved to their own route, and this screen is the landing view — who
 * the athlete is, what comes next, what just happened, and the week against the
 * previous one.
 *
 * Authorization is `GetCoachAthleteOverview` → `ResolveCoachAthleteContext`,
 * which validates the coach profile, the coach's membership in this school, the
 * athlete's membership in this school (or, SAM-30, the coach's own independent
 * link), and `CanReadAthleteCurrentData`. The ids in the URL are navigation
 * context and prove nothing on their own.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import { StatusBadge } from "@/components/status-badge";
import { formatDistance, formatDuration } from "@/lib/format";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { CurrentStateSection } from "@/components/health/current-state-section";
import { GetAthleteCurrentState } from "@/modules/school/application/get-athlete-current-state";
import { GetCoachAthleteOverview } from "@/modules/school/application/get-coach-athlete-overview";
import { loadWeeklyRegularity } from "@/modules/school/application/weekly-regularity";
import { prescriptionScope } from "@/modules/school/application/coach-athlete-scope";
import { WeeklyRegularityCard } from "@/components/workouts/weekly-regularity-card";
import { SchoolError } from "@/modules/school/domain/errors";
import { formatScheduledDateTime } from "@/modules/school/presentation/format";
import { ASSIGNMENT_STATUS_LABELS } from "@/modules/school/presentation/workout-labels";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { MOVED_FROM_SCHOOL_REASON } from "@/modules/school/domain/coach-athlete-assignment";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell, WithheldNotice } from "./athlete-hub-shell";
import { athleteHubHref, type CoachAthleteScope } from "./hub-scope";
import { ContinueIndependentModal, TransferToSchoolModal } from "./transfer-modals";

const overview = new GetCoachAthleteOverview(prisma);

function statusTone(row: { overdue: boolean; status: string }) {
  if (row.overdue) return "warning" as const;
  if (row.status === "COMPLETED" || row.status === "PARTIALLY_COMPLETED") return "success" as const;
  if (row.status === "MISSED") return "danger" as const;
  return "neutral" as const;
}

function statusLabel(row: { overdue: boolean; status: string }): string {
  return row.overdue ? "Atrasado" : ASSIGNMENT_STATUS_LABELS[row.status] ?? row.status;
}

/** Reads as "+12%" / "−8%" / "igual"; null when there is no baseline to compare. */
function deltaLabel(current: number, previous: number): string | null {
  if (previous === 0) return current > 0 ? "primeira semana com volume" : null;
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) return "igual à semana anterior";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)}% vs. semana anterior`;
}

/**
 * SAM-30 — the transfer action offered next to "Prescrever treino": from the
 * independent hub, "Transferir para escola" (one of the coach's schools that
 * takes athletes); from a school hub, "Continuar como independente" — unless a
 * proposal of the pair is already waiting for the athlete.
 */
async function transferAction(
  scope: CoachAthleteScope,
  athleteId: string,
  context: Awaited<ReturnType<typeof overview.execute>>["context"],
): Promise<ReactNode> {
  if (!context.isResponsibleCoach) return null;
  const athleteName = context.athlete.name ?? context.athlete.email ?? "o atleta";

  if (scope.kind === "independent") {
    const memberships = await prisma.coachSchoolMembership.findMany({
      where: {
        coachId: context.coachId, status: "ACTIVE", endedAt: null, suspendedAt: null,
        school: { status: "ACTIVE", joinPolicy: { not: "INVITE_ONLY" } },
      },
      select: { school: { select: { id: true, name: true } } },
      orderBy: { startedAt: "asc" },
    });
    return <TransferToSchoolModal athleteId={athleteId} athleteName={athleteName} schools={memberships.map((row) => row.school)} />;
  }

  if (!context.acceptsIndependentAthletes) return null;
  const proposal = await prisma.coachAthleteAssignment.findFirst({
    where: { athleteId, coachId: context.coachId, schoolId: null, status: "PENDING", reason: MOVED_FROM_SCHOOL_REASON },
    select: { id: true },
  });
  if (proposal) {
    return (
      <span className="theme-pill-warning inline-flex items-center rounded-full border px-3 py-2 text-xs font-medium" data-testid="transfer-pending">
        Proposta enviada — aguardando o atleta
      </span>
    );
  }
  return (
    <ContinueIndependentModal
      athleteId={athleteId}
      athleteName={athleteName}
      schoolId={scope.schoolId}
      schoolName={context.schoolName ?? "escola"}
    />
  );
}

export async function OverviewScreen({ scope, athleteId }: { scope: CoachAthleteScope; athleteId: string }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();

  let data: Awaited<ReturnType<typeof overview.execute>>;
  try {
    data = await overview.execute(session.user.id, scope, athleteId);
  } catch (error) {
    // Authorization failures are 404s from here on purpose: the URL must not
    // reveal which athletes belong to which school.
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { context, counts, nextWorkout, recentWorkouts, thisWeek, previousWeek } = data;
  const extraActions = await transferAction(scope, athleteId, context);
  // SAM-43 — today's health with trend, under the athlete's `metrics` consent; omitted without a health capability.
  const currentState = await new GetAthleteCurrentState(prisma).execute(session.user.id, scope, athleteId);
  const athleteName = context.athlete.name ?? context.athlete.email ?? "o atleta";
  // SAM-16 — rendered server-side in the calendar's zone, so the label never
  // depends on the reader's clock.
  const dateLabel = (value: Date | null) => formatScheduledDateTime(value, context.timeZone);
  const workoutsHref = athleteHubHref(scope, athleteId, "treinos");
  const prescribeHref = `${workoutsHref}/novo`;
  const zoneLabel = scope.kind === "school" ? "fuso da escola" : "fuso do atleta";
  // SAM-63 — the four regularity groups of this week, in the same scope and zone.
  const week = await loadWeeklyRegularity(prisma, {
    athleteId, scope: prescriptionScope(context), owner: { schoolId: context.schoolId, coachId: context.coachId },
    timeZone: context.timeZone, now: new Date(),
  });

  return (
    <AthleteHubShell
      scope={scope}
      athlete={context.athlete}
      teams={context.teams}
      currentCoach={context.currentCoach}
      isResponsibleCoach={context.isResponsibleCoach}
      active="resumo"
      actions={
        context.isResponsibleCoach || extraActions ? (
          <>
            {context.isResponsibleCoach ? (
              <Link
                href={prescribeHref}
                aria-label="Prescrever treino para este atleta"
                className="glass-button-primary rounded-full px-4 py-2 text-sm font-medium"
              >
                Prescrever treino
              </Link>
            ) : null}
            {extraActions}
          </>
        ) : null
      }
    >
      <StatTiles
        items={[
          { label: "A fazer", value: counts.proximos, hint: "Prescrições em aberto" },
          {
            label: "Atrasados",
            value: counts.atrasados,
            tone: counts.atrasados > 0 ? "warning" : "neutral",
            hint: "Passaram da data sem execução",
          },
          { label: "Realizados", value: counts.realizados, tone: "success", hint: "No período atual" },
          {
            label: "Pedidos de alteração",
            value: data.openChangeRequests,
            tone: data.openChangeRequests > 0 ? "warning" : "neutral",
            hint: scope.kind === "school" ? "Em aberto" : "Fora de uma escola, o atleta pede pelos comentários",
          },
        ]}
      />

      {data.heldBack > 0 && (
        <WithheldNotice>
          {scope.kind === "school"
            ? `${data.heldBack} prescrição(ões) de uma passagem anterior deste atleta pela escola não aparecem aqui: `
              + "o histórico de um vínculo encerrado depende de autorização do próprio atleta."
            : `${data.heldBack} prescrição(ões) de um acompanhamento anterior com este atleta não aparecem aqui: `
              + "o histórico de um vínculo encerrado depende de autorização do próprio atleta."}
        </WithheldNotice>
      )}

      {/* SAM-20 — alerts come only from recorded facts; none is the normal state and says so. */}
      <SectionCard title="Alertas" description="O que pede atenção agora, a partir do que está registrado.">
        {data.alerts.length === 0 ? (
          <p className="text-sm text-foreground/50" data-testid="alerts-empty">Nenhum alerta no momento.</p>
        ) : (
          <ul className="space-y-2" data-testid="alerts">
            {data.alerts.map((alert) => (
              <li
                key={alert.kind}
                data-kind={alert.kind}
                className={`rounded-xl border px-4 py-2.5 text-sm ${
                  alert.kind === "restriction" || alert.kind === "volume-spike" ? "theme-panel-warning" : "border-white/10 bg-white/5"
                }`}
              >
                {alert.message}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <CurrentStateSection state={currentState} athleteName={athleteName} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Próximo treino" description="A prescrição em aberto mais próxima.">
          {nextWorkout ? (
            <Link
              href={`${workoutsHref}/${nextWorkout.id}`}
              aria-label={`Abrir treino ${nextWorkout.title}`}
              className="block rounded-[20px] border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{nextWorkout.title}</span>
                <StatusBadge tone={statusTone(nextWorkout)}>{statusLabel(nextWorkout)}</StatusBadge>
              </div>
              <p className="mt-1 text-xs text-foreground/55">
                {[dateLabel(nextWorkout.scheduledAt), resolveSportLabel(nextWorkout.sportType)]
                  .filter(Boolean).join(" · ")}
              </p>
              <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-foreground/60">
                {nextWorkout.targetDurationSeconds != null && (
                  <span>⏱ {formatDuration(nextWorkout.targetDurationSeconds)}</span>
                )}
                {nextWorkout.targetDistanceMeters != null && (
                  <span>📏 {formatDistance(nextWorkout.targetDistanceMeters)}</span>
                )}
              </p>
            </Link>
          ) : (
            <EmptyState
              title="Nenhum treino em aberto"
              description={
                context.isResponsibleCoach
                  ? "Este atleta não tem prescrição pendente. Prescreva o próximo treino quando quiser."
                  : "Este atleta não tem prescrição pendente."
              }
              action={
                context.isResponsibleCoach ? (
                  <Link href={prescribeHref} className="glass-button rounded-full px-4 py-2 text-xs font-medium">
                    Prescrever treino
                  </Link>
                ) : undefined
              }
            />
          )}
        </SectionCard>

        <SectionCard
          title="Volume da semana"
          description={`Semana de segunda a domingo (${zoneLabel}), prescrito ou não — só o que foi feito de fato.`}
        >
          <dl className="grid grid-cols-3 gap-3" data-testid="week-volume">
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/50">Sessões</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{thisWeek.sessions}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/50">Tempo</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {formatDuration(thisWeek.durationSeconds)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-foreground/50">Distância</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {formatDistance(thisWeek.distanceMeters)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-foreground/50">
            {deltaLabel(thisWeek.durationSeconds, previousWeek.durationSeconds)
              ?? "Sem volume registrado nas duas últimas semanas."}
            {thisWeek.unprescribedSessions > 0 && (
              <>
                {" · "}
                <Link
                  href={`${athleteHubHref(scope, athleteId, "atividades")}?origem=nao-planejadas&dias=7`}
                  className="underline-offset-4 hover:underline"
                >
                  {`${thisWeek.unprescribedSessions} sessão(ões) sem prescrição`}
                </Link>
              </>
            )}
          </p>
          <Link
            href={athleteHubHref(scope, athleteId, "analise")}
            className="mt-4 inline-block text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
          >
            Ver análise completa
          </Link>
        </SectionCard>
      </div>

      <WeeklyRegularityCard regularity={week.regularity} load={week.load} />

      <SectionCard
        title="Últimos treinos"
        description="As prescrições mais recentes com data passada."
        action={
          <Link
            href={workoutsHref}
            className="text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
          >
            Ver todos
          </Link>
        }
      >
        {recentWorkouts.length === 0 ? (
          <EmptyState
            title="Nada registrado ainda"
            description="Quando este atleta tiver treinos com data passada, eles aparecem aqui."
          />
        ) : (
          <ul className="space-y-2">
            {recentWorkouts.map((row) => (
              <li key={row.id}>
                <Link
                  href={`${workoutsHref}/${row.id}`}
                  aria-label={`Abrir treino ${row.title}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:bg-white/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{row.title}</span>
                    <span className="block text-xs text-foreground/55">
                      {[dateLabel(row.scheduledAt), resolveSportLabel(row.sportType)]
                        .filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {row.execution?.complianceScore != null && (
                      <span className="text-xs tabular-nums text-foreground/65">
                        {(row.execution.complianceScore / 10).toFixed(1)}/10
                      </span>
                    )}
                    <StatusBadge tone={statusTone(row)}>{statusLabel(row)}</StatusBadge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </AthleteHubShell>
  );
}
