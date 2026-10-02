/**
 * T270 — Dashboard do professor.
 *
 * Organised around "what needs me now" rather than a flat metric list: the
 * numbers at the top say how the roster is doing, and everything below is a
 * queue the coach can actually clear from this screen.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { WorkoutChangeRequestStatus } from "@/modules/school/domain/enums";
import { ListCoachAssignmentRequests } from "@/modules/school/application/list-coach-assignment-requests";
import { StatTiles } from "@/components/stat-tiles";
import { EmptyState } from "@/components/empty-state";
import { CoachRequestsPanel, type CoachRequestRow } from "../(hub)/coach-requests-panel";
import { ChangeRequestsPanel, type ChangeRequestRow } from "./change-requests-panel";

const listCoachRequests = new ListCoachAssignmentRequests(prisma);

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

/** Athletes with no prescription in this many days count as unattended. */
const STALE_ATHLETE_DAYS = 14;

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(value: Date | null): string | null {
  return value ? new Date(value).toLocaleDateString("pt-BR") : null;
}

export default async function ProfessorDashboardPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!coachProfile) notFound();

  const weekAgo = daysAgo(7);
  const staleThreshold = daysAgo(STALE_ATHLETE_DAYS);

  const [
    assignments,
    weekAssignments,
    pendingExecutions,
    avgCompliance,
    pendingRequests,
    changeRequests,
    recentPrescriptions,
    coachRequests,
    pendingReviews,
  ] = await Promise.all([
    prisma.coachAthleteAssignment.findMany({
      // SAM-35 — a PENDING request is not an athlete of this coach yet.
      where: { schoolId, coachId: coachProfile.id, status: "ACTIVE", endedAt: null },
      select: { athleteId: true, athlete: { select: { name: true, email: true } } },
    }),
    prisma.workoutAssignment.count({
      where: { schoolId, coachId: coachProfile.id, createdAt: { gte: weekAgo } },
    }),
    prisma.workoutExecution.count({
      where: {
        assignment: { schoolId, coachId: coachProfile.id },
        matchStatus: "AUTO_MATCHED",
      },
    }),
    prisma.workoutCompliance.aggregate({
      where: { assignment: { schoolId, coachId: coachProfile.id } },
      _avg: { overallScore: true },
    }),
    prisma.workoutRequest.count({ where: { schoolId, status: "PENDING" } }),
    // Requests the administration addressed to THIS coach that are still open —
    // the coach is the only party who can move them forward.
    prisma.workoutChangeRequest.findMany({
      where: {
        schoolId,
        coachId: coachProfile.id,
        status: { in: [WorkoutChangeRequestStatus.PENDING, WorkoutChangeRequestStatus.ACKNOWLEDGED] },
      },
      select: {
        id: true, reason: true, status: true, createdAt: true,
        workoutAssignment: {
          select: {
            scheduledAt: true,
            workout: { select: { title: true } },
            athlete: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    prisma.workoutAssignment.findMany({
      where: { schoolId, coachId: coachProfile.id },
      select: { athleteId: true, scheduledAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    // SAM-26 — athletes asking THIS coach to follow them within this school.
    listCoachRequests.execute(session.user.id, { schoolId }),
    // SAM-27 — athletes asking THIS coach to evaluate what they did; an evaluation closes it.
    prisma.workoutAssignmentComment.count({
      where: {
        kind: "REVIEW_REQUEST",
        resolvedAt: null,
        workoutAssignment: { schoolId, coachId: coachProfile.id },
      },
    }),
  ]);

  const coachRequestRows: CoachRequestRow[] = coachRequests.map((request) => ({
    id: request.id,
    athleteName: request.athlete.name ?? request.athlete.email,
    athleteEmail: request.athlete.email,
    athleteImage: request.athlete.image,
    schoolId: request.schoolId,
    schoolName: request.schoolName,
    note: request.note,
    requestedAt: request.requestedAt.toISOString(),
    canAccept: request.canAccept,
    blockedReason: request.blockedReason,
  }));

  const avgScore = avgCompliance._avg.overallScore;

  // "Sem treino recente" is derived from the prescriptions already fetched
  // rather than one query per athlete, which would be N+1 on the roster.
  const lastPrescriptionByAthlete = new Map<string, Date>();
  for (const prescription of recentPrescriptions) {
    const current = lastPrescriptionByAthlete.get(prescription.athleteId);
    const at = prescription.scheduledAt ?? prescription.createdAt;
    if (!current || at > current) lastPrescriptionByAthlete.set(prescription.athleteId, at);
  }

  const staleAthletes = assignments
    .map(({ athleteId, athlete }) => ({
      athleteId,
      name: athlete.name ?? athlete.email ?? "Sem nome",
      lastAt: lastPrescriptionByAthlete.get(athleteId) ?? null,
    }))
    .filter((athlete) => athlete.lastAt === null || athlete.lastAt < staleThreshold)
    .sort((a, b) => {
      // Never-prescribed first: they are the most overdue, and a null date
      // cannot be compared on the same scale as a real one.
      if (a.lastAt === null) return b.lastAt === null ? 0 : -1;
      if (b.lastAt === null) return 1;
      return a.lastAt.getTime() - b.lastAt.getTime();
    });

  const changeRows: ChangeRequestRow[] = changeRequests.map((request) => ({
    id: request.id,
    reason: request.reason,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    athleteName:
      request.workoutAssignment.athlete.name ?? request.workoutAssignment.athlete.email ?? "Sem nome",
    workoutTitle: request.workoutAssignment.workout?.title ?? "Treino agendado",
    scheduledAt: formatDate(request.workoutAssignment.scheduledAt),
  }));

  return (
    <div className="space-y-6 p-6 md:p-10">
      <div>
        <h1 className="text-2xl font-semibold">
          Olá, {(session.user.name ?? "Professor")?.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-foreground/60">O que precisa de você hoje nesta escola.</p>
      </div>

      <StatTiles
        items={[
          {
            label: "Meus atletas",
            value: assignments.length,
            hint:
              staleAthletes.length > 0
                ? `${staleAthletes.length} sem treino há ${STALE_ATHLETE_DAYS}+ dias`
                : "todos com treino recente",
            tone: staleAthletes.length > 0 ? "warning" : "neutral",
          },
          { label: "Prescrições (7 dias)", value: weekAssignments },
          {
            label: "Confirmações pendentes",
            value: pendingExecutions,
            tone: pendingExecutions > 0 ? "warning" : "neutral",
          },
          {
            label: "Revisões pedidas",
            value: pendingReviews,
            hint: pendingReviews > 0 ? "atletas aguardando sua avaliação" : undefined,
            tone: pendingReviews > 0 ? "warning" : "neutral",
          },
          {
            label: "Compliance médio",
            value: avgScore != null ? `${(avgScore / 10).toFixed(1)}/10` : "—",
            // SAM-19 — honest: no matched execution scored yet, never a zero.
            hint: avgScore == null ? "nenhuma execução casada ainda" : undefined,
          },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/professor/${schoolId}/treinos`}
          className="glass-button rounded-full px-4 py-2 text-sm font-semibold"
        >
          Prescrever treino
        </Link>
        <Link
          href={`/professor/${schoolId}/atletas`}
          className="glass-button rounded-full px-4 py-2 text-sm font-semibold"
        >
          Meus atletas
        </Link>
        {pendingRequests > 0 && (
          <Link
            href={`/professor/${schoolId}/treinos`}
            className="rounded-full bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/30"
          >
            {pendingRequests} solicitação(ões) de treino
          </Link>
        )}
      </div>

      {coachRequestRows.length > 0 && (
        <section className="space-y-3" data-testid="coach-requests-section">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Pedidos de acompanhamento nesta escola ({coachRequestRows.length})
          </h2>
          <CoachRequestsPanel requests={coachRequestRows} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
          Pedidos de ajuste da administração ({changeRows.length})
        </h2>
        {changeRows.length === 0 ? (
          <EmptyState
            title="Nenhum pedido em aberto"
            description="Quando a administração pedir revisão de uma prescrição sua, ela aparece aqui para você assumir, concluir ou recusar."
          />
        ) : (
          <ChangeRequestsPanel schoolId={schoolId} requests={changeRows} />
        )}
      </section>

      {staleAthletes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Sem treino há mais de {STALE_ATHLETE_DAYS} dias ({staleAthletes.length})
          </h2>
          <ul className="glass divide-y divide-white/5 rounded-[20px]">
            {staleAthletes.slice(0, 8).map((athlete) => (
              <li key={athlete.athleteId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{athlete.name}</p>
                  <p className="text-xs text-foreground/50">
                    {athlete.lastAt
                      ? `Último treino em ${formatDate(athlete.lastAt)}`
                      : "Nunca recebeu treino"}
                  </p>
                </div>
                <Link
                  href={`/professor/${schoolId}/atletas/${athlete.athleteId}`}
                  className="text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
                >
                  Abrir →
                </Link>
              </li>
            ))}
          </ul>
          {staleAthletes.length > 8 && (
            <p className="text-xs text-foreground/45">
              e mais {staleAthletes.length - 8} — veja a lista completa em Meus atletas.
            </p>
          )}
        </section>
      )}

      {pendingExecutions > 0 && (
        <div className="theme-panel-warning rounded-2xl border p-4 text-sm">
          Você tem <strong>{pendingExecutions}</strong> execução(ões) aguardando confirmação.{" "}
          <Link href={`/professor/${schoolId}/atletas`} className="font-medium underline underline-offset-2">
            Ver atletas →
          </Link>
        </div>
      )}
    </div>
  );
}
