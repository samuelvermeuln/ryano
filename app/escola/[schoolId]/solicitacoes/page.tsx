/**
 * T261 — Tela solicitações pendentes
 * T262 — Ações aprovar/recusar
 *
 * Inbox for people asking to join the school. Sending new invitations is a
 * separate concern and lives in /convites — this screen links there instead
 * of duplicating the form, so there is one place where a link is issued.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import { RequestDecision, type PendingRequest } from "./request-decision";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

function waitingDays(since: string): number {
  return Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000);
}

function waitingLabel(since: string): string {
  const days = waitingDays(since);
  if (days <= 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}

function RequestList({
  schoolId,
  requests,
  kind,
}: {
  schoolId: string;
  requests: PendingRequest[];
  kind: "athlete" | "coach";
}) {
  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li
          key={request.membershipId}
          className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="font-medium">{request.name}</p>
            <p className="text-xs text-foreground/50">{request.email ?? "—"}</p>
            <p className="mt-0.5 text-xs text-foreground/40">
              Solicitou {waitingLabel(request.requestedAt)}
            </p>
          </div>
          <RequestDecision schoolId={schoolId} membershipId={request.membershipId} kind={kind} />
        </li>
      ))}
    </ul>
  );
}

export default async function SolicitacoesPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;

  const [pendingAthletes, pendingCoaches] = await Promise.all([
    prisma.schoolAthleteMembership.findMany({
      where: { schoolId, status: "PENDING" },
      include: { athlete: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.coachSchoolMembership.findMany({
      where: { schoolId, status: "PENDING" },
      include: { coach: { include: { user: { select: { name: true, email: true } } } } },
      orderBy: { startedAt: "asc" },
    }),
  ]);

  const athleteRequests: PendingRequest[] = pendingAthletes.map((membership) => ({
    membershipId: membership.id,
    name: membership.athlete.name ?? membership.athlete.email ?? "Sem nome",
    email: membership.athlete.email,
    requestedAt: membership.createdAt.toISOString(),
  }));

  const coachRequests: PendingRequest[] = pendingCoaches.map((membership) => ({
    membershipId: membership.id,
    name: membership.coach.user.name ?? membership.coach.user.email ?? "Sem nome",
    email: membership.coach.user.email,
    requestedAt: (membership.startedAt ?? membership.createdAt).toISOString(),
  }));

  const all = [...athleteRequests, ...coachRequests];
  const total = all.length;
  const waitingOverThreeDays = all.filter((request) => waitingDays(request.requestedAt) >= 3).length;
  const oldest = all.reduce<string | null>(
    (oldestSoFar, request) =>
      oldestSoFar === null || request.requestedAt < oldestSoFar ? request.requestedAt : oldestSoFar,
    null,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Solicitações pendentes</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Pessoas que pediram para entrar na escola e aguardam sua decisão.
          </p>
        </div>
        <Link
          href={`/escola/${schoolId}/convites`}
          className="glass-button shrink-0 rounded-full px-5 py-2 text-sm font-semibold text-foreground"
        >
          Convidar alguém
        </Link>
      </div>

      <StatTiles
        items={[
          { label: "Aguardando", value: total, tone: total > 0 ? "warning" : "success" },
          { label: "Atletas", value: athleteRequests.length },
          { label: "Professores", value: coachRequests.length },
          {
            label: "Esperando 3+ dias",
            value: waitingOverThreeDays,
            tone: waitingOverThreeDays > 0 ? "danger" : "neutral",
            hint: oldest ? `Mais antiga ${waitingLabel(oldest)}` : undefined,
          },
        ]}
      />

      {total === 0 ? (
        <SectionCard
          title="Nada pendente"
          description="Quando alguém entrar por um convite que exige aprovação, a solicitação aparece aqui."
        >
          <p className="py-6 text-center text-sm text-foreground/45">
            Nenhuma solicitação aguardando decisão.
          </p>
        </SectionCard>
      ) : (
        <>
          {athleteRequests.length > 0 && (
            <SectionCard title={`Atletas (${athleteRequests.length})`}>
              <RequestList schoolId={schoolId} requests={athleteRequests} kind="athlete" />
            </SectionCard>
          )}

          {coachRequests.length > 0 && (
            <SectionCard title={`Professores (${coachRequests.length})`}>
              <RequestList schoolId={schoolId} requests={coachRequests} kind="coach" />
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
