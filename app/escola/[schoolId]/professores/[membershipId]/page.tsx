/**
 * Ficha do professor dentro de uma escola: identidade, contato, endereço,
 * último acesso, atletas acompanhados, prescrições, solicitações de alteração
 * e relatório gerencial.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetCoachDetail } from "@/modules/school/application/get-coach-detail";
import { GetCoachManagementReport } from "@/modules/school/application/get-coach-management-report";
import { ListCoachPrescriptions } from "@/modules/school/application/list-coach-prescriptions";
import { ListWorkoutChangeRequests } from "@/modules/school/application/list-workout-change-requests";
import { SchoolError } from "@/modules/school/domain/errors";
import { WorkoutChangeRequestStatus } from "@/modules/school/domain/enums";
import { schoolRoleLabel } from "@/modules/school/presentation/role-labels";
import {
  formatAddress,
  formatDate,
  formatDateTime,
  formatPhoneBR,
} from "@/modules/school/presentation/format";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import {
  AssignAthleteForm,
  CancelChangeRequestButton,
  DeactivateCoachButton,
  RequestChangeForm,
} from "../coach-actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; membershipId: string }>;
  searchParams: Promise<{ dias?: string }>;
};

const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendado",
  AVAILABLE: "Disponível",
  COMPLETED: "Concluído",
  PARTIALLY_COMPLETED: "Parcial",
  MISSED: "Não realizado",
  CANCELLED: "Cancelado",
  RESCHEDULED: "Remarcado",
  JUSTIFIED: "Justificado",
  UNPLANNED: "Não planejado",
};

const CHANGE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando professor",
  ACKNOWLEDGED: "Em análise",
  RESOLVED: "Resolvida",
  DECLINED: "Recusada",
  CANCELLED: "Retirada",
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-foreground/45">{label}</dt>
      <dd className="mt-1 text-sm">{value ?? <span className="text-foreground/40">Não informado</span>}</dd>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wide text-foreground/45">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-foreground/45">{hint}</p>}
    </div>
  );
}

export default async function ProfessorDetalhePage({ params, searchParams }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, membershipId } = await params;
  const { dias } = await searchParams;
  const actorId = session.user.id;

  let detail;
  let report;
  let prescriptions;
  let changeRequests;
  try {
    detail = await new GetCoachDetail(prisma).execute(actorId, schoolId, membershipId);
    [report, prescriptions, changeRequests] = await Promise.all([
      new GetCoachManagementReport(prisma).execute(actorId, schoolId, membershipId, dias ? { days: dias } : {}),
      new ListCoachPrescriptions(prisma).execute(actorId, schoolId, membershipId, { limit: 20 }),
      new ListWorkoutChangeRequests(prisma).execute(actorId, schoolId, { limit: 20, coachId: detail.coach.id }),
    ]);
  } catch (error) {
    // Any authorization or lookup failure collapses into 404 so this URL cannot
    // be used to probe which coach memberships exist.
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { membership, coach, user, athletes, lastAccess, schoolMembership } = detail;
  const isActive = membership.status === "ACTIVE";

  const openRequestsByAssignment = new Map(
    changeRequests.items
      .filter((r) => r.status === WorkoutChangeRequestStatus.PENDING
        || r.status === WorkoutChangeRequestStatus.ACKNOWLEDGED)
      .map((r) => [r.workoutAssignmentId, r]),
  );

  // Athletes this coach does not already follow — the only ones it makes sense
  // to forward. Their current coach is shown so the transfer is not blind.
  const assignedIds = new Set(athletes.map((a) => a.athleteId));
  const schoolAthletes = isActive
    ? await prisma.schoolAthleteMembership.findMany({
      where: { schoolId, status: "ACTIVE", athleteId: { notIn: [...assignedIds] } },
      select: {
        athleteId: true,
        athlete: { select: { name: true, email: true } },
      },
      orderBy: { startedAt: "asc" },
      take: 200,
    })
    : [];

  const currentCoaches = schoolAthletes.length === 0 ? [] : await prisma.coachAthleteAssignment.findMany({
    where: {
      schoolId,
      status: "ACTIVE",
      isPrimary: true,
      athleteId: { in: schoolAthletes.map((a) => a.athleteId) },
    },
    select: { athleteId: true, coach: { select: { displayName: true, user: { select: { name: true } } } } },
  });
  const coachByAthlete = new Map(
    currentCoaches.map((c) => [c.athleteId, c.coach.user?.name ?? c.coach.displayName ?? "outro professor"]),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={`/escola/${schoolId}/professores`}
            className="text-xs text-foreground/50 hover:text-foreground transition-colors"
          >
            ← Professores
          </Link>
          <h1 className="mt-2 text-xl font-semibold">
            {user.name ?? coach.displayName ?? user.email}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone={isActive ? "success" : "neutral"}>
              {isActive ? "Ativo" : "Encerrado"}
            </StatusBadge>
            {schoolMembership?.roles.map((r) => (
              <StatusBadge key={r.role} tone="neutral">{schoolRoleLabel(r.role)}</StatusBadge>
            ))}
          </div>
        </div>
        {isActive && <DeactivateCoachButton schoolId={schoolId} membershipId={membership.id} />}
      </div>

      <SectionCard title="Dados de contato">
        <dl className="grid gap-5 sm:grid-cols-2">
          <Field label="Nome" value={user.name} />
          <Field label="Nome de exibição" value={coach.displayName} />
          <Field label="E-mail" value={user.email} />
          <Field label="Telefone" value={formatPhoneBR(user.phoneE164)} />
          <div className="sm:col-span-2">
            <Field label="Endereço" value={formatAddress(user.address)} />
          </div>
          {coach.bio && (
            <div className="sm:col-span-2">
              <Field label="Bio" value={coach.bio} />
            </div>
          )}
        </dl>
      </SectionCard>

      <SectionCard title="Acesso e vínculo">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Último acesso"
            value={lastAccess.at ? formatDateTime(lastAccess.at) : null}
          />
          <Field
            label="Sessão ativa"
            value={lastAccess.hasActiveSession ? "Sim" : "Não"}
          />
          <Field label="Vínculo desde" value={formatDate(membership.startedAt ?? membership.requestedAt)} />
          <Field
            label="Vínculo até"
            value={membership.endedAt ? formatDate(membership.endedAt) : null}
          />
        </dl>
        {!lastAccess.at && (
          <p className="mt-3 text-xs text-foreground/45">
            O último acesso é estimado a partir das sessões ativas. Quem saiu da conta aparece
            sem data, o que não significa que nunca acessou.
          </p>
        )}
      </SectionCard>

      <SectionCard title={`Relatório gerencial — últimos ${report.window.days} dias`}>
        <div className="mb-4 flex flex-wrap gap-2">
          {[7, 30, 90].map((days) => (
            <Link
              key={days}
              href={`/escola/${schoolId}/professores/${membershipId}?dias=${days}`}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                report.window.days === days
                  ? "border-white/25 bg-white/10 text-foreground"
                  : "border-white/10 bg-white/5 text-foreground/60 hover:border-white/20"
              }`}
            >
              {days} dias
            </Link>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Atletas ativos" value={String(report.activeAthletes)} />
          <Metric label="Prescrições" value={String(report.prescriptions.total)} />
          <Metric
            label="Avaliações"
            value={report.evaluations.averageScore === null ? "—" : String(report.evaluations.averageScore)}
            hint={`${report.evaluations.total} no período`}
          />
          <Metric
            label="Aderência média"
            value={report.compliance.averageScore === null ? "—" : `${report.compliance.averageScore}%`}
            hint={`${report.compliance.measured} medições`}
          />
        </div>

        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {Object.entries(report.prescriptions.byStatus)
            .filter(([, count]) => count > 0)
            .map(([status, count]) => (
              <div key={status} className="flex items-baseline gap-2">
                <dt className="text-foreground/50">{ASSIGNMENT_STATUS_LABELS[status] ?? status}</dt>
                <dd className="font-medium tabular-nums">{count}</dd>
              </div>
            ))}
        </dl>

        {report.pendingChangeRequests > 0 && (
          <p className="mt-4 text-sm text-foreground/60">
            {report.pendingChangeRequests} solicitação(ões) de alteração aguardando resposta.
          </p>
        )}
      </SectionCard>

      <SectionCard title={`Atletas acompanhados (${athletes.length})`}>
        {athletes.length === 0 ? (
          <p className="text-sm text-foreground/45">Nenhum atleta atribuído a este professor.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {athletes.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="font-medium">{a.athlete.name ?? a.athlete.email}</span>
                <span className="flex items-center gap-3 text-xs text-foreground/50">
                  {a.sportType && <span>{a.sportType}</span>}
                  {a.isPrimary && <StatusBadge tone="success">Principal</StatusBadge>}
                  <span>desde {formatDate(a.startedAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {isActive && (
          <div className="mt-5 border-t border-white/8 pt-5">
            <p className="mb-3 text-sm font-medium">Encaminhar atleta</p>
            <AssignAthleteForm
              schoolId={schoolId}
              membershipId={membershipId}
              coachId={coach.id}
              athletes={schoolAthletes.map((a) => ({
                id: a.athleteId,
                label: a.athlete.name ?? a.athlete.email ?? a.athleteId,
                currentCoach: coachByAthlete.get(a.athleteId) ?? null,
              }))}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Prescrições">
        {prescriptions.items.length === 0 ? (
          <p className="text-sm text-foreground/45">Este professor ainda não prescreveu treinos nesta escola.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs text-foreground/50 uppercase tracking-wide">
                  <th className="py-3 pr-4 font-medium">Treino</th>
                  <th className="py-3 pr-4 font-medium">Atleta</th>
                  <th className="py-3 pr-4 font-medium">Data</th>
                  <th className="py-3 pr-4 font-medium">Situação</th>
                  <th className="py-3 pr-4 font-medium">Alteração</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {prescriptions.items.map((p) => (
                  <tr key={p.id} className="align-top hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pr-4 font-medium">
                      {p.workout?.title ?? p.sourceLabel ?? "Treino agendado"}
                    </td>
                    <td className="py-3 pr-4 text-foreground/60">
                      {p.athlete?.name ?? p.athlete?.email ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-xs text-foreground/50">
                      {formatDate(p.scheduledAt ?? p.createdAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone={p.status === "COMPLETED" ? "success" : "neutral"}>
                        {ASSIGNMENT_STATUS_LABELS[p.status] ?? p.status}
                      </StatusBadge>
                    </td>
                    <td className="py-3 pr-4">
                      <RequestChangeForm
                        schoolId={schoolId}
                        membershipId={membershipId}
                        workoutAssignmentId={p.id}
                        hasOpenRequest={openRequestsByAssignment.has(p.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {prescriptions.nextCursor && (
          <p className="mt-4 text-xs text-foreground/45">
            Mostrando as {prescriptions.items.length} prescrições mais recentes.
          </p>
        )}
      </SectionCard>

      {changeRequests.items.length > 0 && (
        <SectionCard title="Solicitações de alteração">
          <ul className="divide-y divide-white/5">
            {changeRequests.items.map((r) => {
              const isOpen = r.status === WorkoutChangeRequestStatus.PENDING
                || r.status === WorkoutChangeRequestStatus.ACKNOWLEDGED;
              return (
                <li key={r.id} className="space-y-2 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-medium">
                      {r.workoutAssignment.workout?.title
                        ?? r.workoutAssignment.sourceLabel
                        ?? "Treino agendado"}
                      {r.workoutAssignment.athlete?.name && (
                        <span className="font-normal text-foreground/55">
                          {" "}· {r.workoutAssignment.athlete.name}
                        </span>
                      )}
                    </span>
                    <StatusBadge tone={isOpen ? "warning" : "neutral"}>
                      {CHANGE_STATUS_LABELS[r.status] ?? r.status}
                    </StatusBadge>
                  </div>
                  <p className="text-foreground/65">{r.reason}</p>
                  {r.resolutionNote && (
                    <p className="text-xs text-foreground/50">Resposta: {r.resolutionNote}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/45">
                    <span>
                      pedida por {r.requester.name ?? r.requester.email} em {formatDate(r.createdAt)}
                    </span>
                    {isOpen && (
                      <CancelChangeRequestButton
                        schoolId={schoolId}
                        membershipId={membershipId}
                        requestId={r.id}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
