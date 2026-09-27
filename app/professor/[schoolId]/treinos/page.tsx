/**
 * T273 — Editor de treino (lista de treinos/templates do professor)
 * T275 — Biblioteca de templates
 * T276 — Fluxo atribuir treino
 *
 * Pending athlete requests come first because they are the only item on this
 * page where someone is waiting on the coach.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { getRyvanoSportLabel, isRyvanoSportType } from "@/modules/shared/activities/sport-types";
import { StatTiles } from "@/components/stat-tiles";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { DeclineRequestForm, FulfillRequestForm } from "./fulfill-request-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendado",
  AVAILABLE: "Disponível",
  COMPLETED: "Concluído",
  PARTIALLY_COMPLETED: "Parcial",
  MISSED: "Não feito",
  CANCELLED: "Cancelado",
  RESCHEDULED: "Remarcado",
  JUSTIFIED: "Justificado",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  SCHEDULED: "neutral",
  AVAILABLE: "neutral",
  COMPLETED: "success",
  PARTIALLY_COMPLETED: "warning",
  MISSED: "danger",
  CANCELLED: "neutral",
  RESCHEDULED: "warning",
  JUSTIFIED: "neutral",
};

function sportLabel(sportType: string | null): string {
  if (!sportType) return "—";
  return isRyvanoSportType(sportType) ? getRyvanoSportLabel(sportType) : sportType;
}

export default async function TreinosPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!coachProfile) notFound();

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [recentAssignments, templates, pendingRequests, completedLast30, missedLast30] =
    await Promise.all([
      prisma.workoutAssignment.findMany({
        where: { schoolId, coachId: coachProfile.id },
        include: {
          workout: { select: { title: true, sportType: true } },
          athlete: { select: { name: true, email: true } },
          team: { select: { name: true } },
        },
        orderBy: { scheduledAt: "desc" },
        take: 30,
      }),
      // T275 — Templates library
      prisma.workoutTemplate.findMany({
        where: {
          OR: [
            { ownerType: "COACH", ownerId: coachProfile.id },
            { authorCoachId: coachProfile.id },
            { schoolId },
          ],
          status: { not: "ARCHIVED" },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.workoutRequest.findMany({
        where: { schoolId, status: "PENDING" },
        include: { athlete: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.workoutAssignment.count({
        where: {
          schoolId, coachId: coachProfile.id,
          status: "COMPLETED", scheduledAt: { gte: monthAgo },
        },
      }),
      prisma.workoutAssignment.count({
        where: {
          schoolId, coachId: coachProfile.id,
          status: "MISSED", scheduledAt: { gte: monthAgo },
        },
      }),
    ]);

  const decided = completedLast30 + missedLast30;

  return (
    <div className="space-y-8 p-6 md:p-10">
      <div>
        <h1 className="text-xl font-semibold">Treinos</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Solicitações dos atletas, sua biblioteca de templates e as prescrições recentes.
        </p>
      </div>

      <StatTiles
        items={[
          {
            label: "Solicitações pendentes",
            value: pendingRequests.length,
            tone: pendingRequests.length > 0 ? "warning" : "success",
            hint: pendingRequests.length === 0 ? "nada na fila" : "atletas aguardando",
          },
          { label: "Templates", value: templates.length },
          { label: "Concluídos (30 dias)", value: completedLast30, tone: "success" },
          {
            label: "Adesão (30 dias)",
            // Only decided prescriptions count: those still scheduled have not
            // failed, and including them would understate adherence.
            value: decided === 0 ? "—" : `${Math.round((completedLast30 / decided) * 100)}%`,
            hint: decided === 0 ? "sem dados" : `${missedLast30} não feito(s)`,
            tone: decided > 0 && completedLast30 / decided < 0.6 ? "warning" : "neutral",
          },
        ]}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
          Solicitações pendentes ({pendingRequests.length})
        </h2>
        {pendingRequests.length === 0 ? (
          <EmptyState
            title="Nenhuma solicitação na fila"
            description="Quando um atleta desta escola pedir um treino, o pedido aparece aqui para você aprovar ou recusar."
          />
        ) : (
          <ul className="space-y-3">
            {pendingRequests.map((request) => (
              <li key={request.id} className="glass space-y-3 rounded-[20px] p-4">
                <div>
                  <p className="text-sm font-medium">
                    {request.athlete.name ?? request.athlete.email ?? "Sem nome"}
                  </p>
                  <p className="text-xs text-foreground/50">
                    {sportLabel(request.sportType)}
                    {request.preferredDate
                      ? ` · prefere ${new Date(request.preferredDate).toLocaleDateString("pt-BR")}`
                      : ""}
                  </p>
                  {request.note && (
                    <p className="mt-1 text-xs leading-relaxed text-foreground/65">
                      &ldquo;{request.note}&rdquo;
                    </p>
                  )}
                </div>
                <FulfillRequestForm
                  requestId={request.id}
                  schoolId={schoolId}
                  defaultSportType={sportLabel(request.sportType)}
                  defaultDate={request.preferredDate}
                />
                <DeclineRequestForm requestId={request.id} schoolId={schoolId} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {templates.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Biblioteca de templates ({templates.length})
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <li key={template.id} className="glass space-y-1 rounded-[20px] p-4">
                <p className="text-sm font-medium">{template.title}</p>
                <p className="text-xs text-foreground/50">{sportLabel(template.sportType)}</p>
                <p className="text-xs text-foreground/40">
                  Atualizado em {new Date(template.updatedAt).toLocaleDateString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
          Prescrições recentes ({recentAssignments.length})
        </h2>
        {recentAssignments.length === 0 ? (
          <EmptyState
            title="Nenhuma prescrição ainda"
            description="Aprove uma solicitação acima ou prescreva um treino a partir da ficha de um atleta."
          />
        ) : (
          <div className="glass overflow-x-auto rounded-[20px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-foreground/50">
                  <th className="px-4 py-3 font-medium">Treino</th>
                  <th className="px-4 py-3 font-medium">Atleta</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentAssignments.map((assignment) => (
                  <tr key={assignment.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-medium">{assignment.workout?.title ?? "Treino agendado"}</p>
                      <p className="text-xs text-foreground/45">
                        {sportLabel(assignment.workout?.sportType ?? null)}
                        {assignment.team ? ` · ${assignment.team.name}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/professor/${schoolId}/atletas/${assignment.athleteId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {assignment.athlete.name ?? assignment.athlete.email ?? "Sem nome"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground/60">
                      {assignment.scheduledAt
                        ? new Date(assignment.scheduledAt).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={STATUS_TONE[assignment.status] ?? "neutral"}>
                        {STATUS_LABEL[assignment.status] ?? assignment.status}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
