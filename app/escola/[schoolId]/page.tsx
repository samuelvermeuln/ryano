/**
 * T253 — Tela dashboard administrativo
 * Visão operacional da escola: quem treinou, quem está atrasado e adesão da
 * semana. Deliberadamente NÃO exibe métricas de wearable (prontidão, sono,
 * HRV, Body Battery): a escola não conecta relógio próprio, e biometria do
 * atleta depende de `HistoryAccessGrant` concedido pelo próprio atleta. As
 * execuções abaixo são dados que o atleta já compartilhou com a escola ao
 * executar um treino prescrito por ela.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { UserAvatar } from "@/components/user-avatar";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { PublicProfileEditor, type PublicProfileManager } from "./public-profile-editor";

export const dynamic = "force-dynamic";

/** SAM-28 — what the /app/escola modal shows, plus who may be named as contact. */
async function getPublicProfile(schoolId: string) {
  const [school, managers] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        achievements: true, specialties: true, sportTypes: true, adminContactUserId: true, ownerUserId: true,
        owner: { select: { name: true, image: true } },
        adminContact: { select: { name: true, image: true } },
      },
    }),
    prisma.schoolMembership.findMany({
      where: { schoolId, status: "ACTIVE", roles: { some: { role: { in: ["OWNER", "ADMIN"] } } } },
      select: { userId: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
  ]);
  if (!school) return null;
  const responsible = school.adminContact ?? school.owner;
  return {
    achievements: school.achievements,
    specialties: school.specialties,
    sportTypes: school.sportTypes,
    adminContactUserId: school.adminContactUserId,
    responsible: responsible ? { name: responsible.name, image: responsible.image } : null,
    managers: managers.map<PublicProfileManager>((member) => ({
      userId: member.userId, name: member.user.name, email: member.user.email, isOwner: member.userId === school.ownerUserId,
    })),
  };
}

type PageProps = { params: Promise<{ schoolId: string }> };

/** Prescrito e ainda não executado — os estados que podem vencer. */
const OPEN_STATUSES = ["SCHEDULED", "AVAILABLE"] as const;

function startOfUtcDay(date: Date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date | null) {
  return date ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
}

function daysLate(from: Date, today: Date) {
  return Math.floor((today.getTime() - from.getTime()) / 86_400_000);
}

export async function getSchoolOverview(schoolId: string) {
  const today = startOfUtcDay(new Date());
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() || 7) + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const [
    school,
    athleteCount,
    coachCount,
    teamCount,
    pendingAthleteRequests,
    pendingCoachRequests,
    overdue,
    weekAssignments,
    recentExecutions,
  ] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, status: true },
    }),
    prisma.schoolAthleteMembership.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.coachSchoolMembership.count({ where: { schoolId, status: "ACTIVE", endedAt: null } }),
    prisma.team.count({ where: { schoolId, archivedAt: null } }),
    // O card leva à tela de solicitações, que lista atletas E professores
    // pendentes. O mesmo `where` das duas listas é reproduzido aqui para que o
    // número e a lista nunca discordem.
    prisma.schoolAthleteMembership.count({ where: { schoolId, status: "PENDING" } }),
    prisma.coachSchoolMembership.count({ where: { schoolId, status: "PENDING" } }),
    prisma.workoutAssignment.findMany({
      where: { schoolId, status: { in: [...OPEN_STATUSES] }, scheduledAt: { lt: today } },
      select: {
        id: true,
        scheduledAt: true,
        athlete: { select: { id: true, name: true, email: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 200,
    }),
    prisma.workoutAssignment.groupBy({
      by: ["status"],
      where: { schoolId, scheduledAt: { gte: weekStart, lt: weekEnd } },
      _count: true,
    }),
    prisma.workoutExecution.findMany({
      where: { assignment: { schoolId } },
      select: {
        id: true,
        startedAt: true,
        source: true,
        athlete: { select: { id: true, name: true, email: true } },
        assignment: { select: { workout: { select: { title: true } } } },
        compliance: { select: { overallScore: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    school,
    athleteCount,
    coachCount,
    teamCount,
    pendingRequests: pendingAthleteRequests + pendingCoachRequests,
    overdue,
    weekAssignments,
    recentExecutions,
    today,
  };
}

export default async function EscolaDashboardPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;
  const [data, publicProfile] = await Promise.all([getSchoolOverview(schoolId), getPublicProfile(schoolId)]);
  if (!data.school || !publicProfile) notFound();

  const weekTotal = data.weekAssignments.reduce((sum, g) => sum + g._count, 0);
  const weekDone = data.weekAssignments
    .filter((g) => g.status === "COMPLETED" || g.status === "PARTIALLY_COMPLETED")
    .reduce((sum, g) => sum + g._count, 0);

  // A escola age sobre a pessoa, não sobre a linha de treino: agrupa por atleta.
  const lateByAthlete = new Map<string, { name: string; count: number; oldest: Date | null }>();
  for (const a of data.overdue) {
    const entry = lateByAthlete.get(a.athlete.id) ?? {
      name: a.athlete.name ?? a.athlete.email ?? "Atleta",
      count: 0,
      oldest: a.scheduledAt,
    };
    entry.count += 1;
    if (a.scheduledAt && (!entry.oldest || a.scheduledAt < entry.oldest)) entry.oldest = a.scheduledAt;
    lateByAthlete.set(a.athlete.id, entry);
  }
  const lateRanking = [...lateByAthlete.entries()].sort((a, b) => b[1].count - a[1].count);

  const stats = [
    { label: "Atletas ativos", value: data.athleteCount, href: `/escola/${schoolId}/atletas` },
    { label: "Professores ativos", value: data.coachCount, href: `/escola/${schoolId}/professores` },
    { label: "Turmas ativas", value: data.teamCount, href: `/escola/${schoolId}/turmas` },
    {
      label: "Solicitações pendentes",
      value: data.pendingRequests,
      href: `/escola/${schoolId}/solicitacoes`,
    },
    { label: "Treinos na semana", value: weekTotal, href: null },
    { label: "Concluídos na semana", value: `${weekDone}/${weekTotal}`, href: null },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{data.school.name}</h1>
        <p className="text-sm text-foreground/50 mt-1">Visão operacional da escola</p>
        {data.school.status !== "ACTIVE" && (
          <span className="text-sm text-destructive font-medium">Escola desativada</span>
        )}
      </div>

      <SectionCard title="Visão geral">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map(({ label, value, href }) => {
            const body = (
              <>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
                <p className="text-sm text-foreground/55 mt-1">{label}</p>
              </>
            );
            return (
              <li key={label} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
                {href ? (
                  <Link href={href} className="block hover:opacity-80 transition-opacity">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      {/* SAM-28 — what an athlete reads in /app/escola before asking to join. */}
      <div data-testid="public-profile-section">
        <SectionCard
          title="Perfil público"
          description="O que um atleta vê ao abrir a escola em /app/escola: conquistas, especialidades, modalidades e quem responde pela escola."
          action={
            <PublicProfileEditor
              schoolId={schoolId}
              initial={{
                achievements: publicProfile.achievements,
                specialties: publicProfile.specialties,
                sportTypes: publicProfile.sportTypes,
                adminContactUserId: publicProfile.adminContactUserId,
              }}
              managers={publicProfile.managers}
            />
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">Prêmios e conquistas</h3>
              {publicProfile.achievements.length === 0 ? (
                <p className="mt-2 text-sm text-foreground/50">Nenhuma conquista informada ainda.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm" data-testid="school-achievements-admin">
                  {publicProfile.achievements.map((item) => (
                    <li key={item} className="flex gap-2"><span aria-hidden>🏅</span><span>{item}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">Especialidades</h3>
              {publicProfile.specialties.length === 0 ? (
                <p className="mt-2 text-sm text-foreground/50">Nenhuma especialidade informada ainda.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {publicProfile.specialties.map((item) => (
                    <span key={item} className="theme-pill-neutral rounded-full px-2.5 py-1 text-xs font-medium">{item}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">Modalidades</h3>
              {publicProfile.sportTypes.length === 0 ? (
                <p className="mt-2 text-sm text-foreground/50">Nenhuma modalidade informada ainda.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {publicProfile.sportTypes.map((sport) => (
                    <span key={sport} className="theme-pill-info rounded-full px-2.5 py-1 text-xs font-medium">{resolveSportLabel(sport) ?? sport}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">Responsável administrativo</h3>
              {publicProfile.responsible ? (
                <div className="mt-2 flex items-center gap-3" data-testid="school-responsible-admin">
                  <UserAvatar name={publicProfile.responsible.name ?? "Gestor"} image={publicProfile.responsible.image} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{publicProfile.responsible.name ?? "Gestor da escola"}</p>
                    <p className="text-xs text-foreground/50">{publicProfile.adminContactUserId ? "Indicado pela escola" : "Dono da escola (padrão)"}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-foreground/50">Não informado.</p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground/50 uppercase tracking-wide">
          Planos de treino atrasados
        </h2>
        {lateRanking.length === 0 ? (
          <p className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 text-sm text-foreground/60">
            Nenhum treino vencido sem execução. A escola está em dia.
          </p>
        ) : (
          <div className="theme-panel-warning rounded-2xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide opacity-70">
                  <th className="px-4 py-3 font-medium">Atleta</th>
                  <th className="px-4 py-3 font-medium">Treinos vencidos</th>
                  <th className="px-4 py-3 font-medium">Mais antigo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {lateRanking.map(([athleteId, info]) => (
                  <tr key={athleteId}>
                    <td className="px-4 py-3 font-medium">{info.name}</td>
                    <td className="px-4 py-3 tabular-nums">{info.count}</td>
                    <td className="px-4 py-3 opacity-80">
                      {formatDate(info.oldest)}
                      {info.oldest ? (
                        <span className="ml-1 text-xs">({daysLate(info.oldest, data.today)}d)</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SectionCard
        title="Execuções recentes"
        description="Sincronizado do relógio do atleta"
      >
        {data.recentExecutions.length === 0 ? (
          <p className="text-sm text-foreground/60">
            Nenhuma execução registrada ainda. Um treino aparece aqui quando o atleta o conclui e a
            atividade do relógio dele é associada ao treino prescrito.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs text-foreground/50 uppercase tracking-wide">
                  <th className="py-3 pr-4 font-medium">Atleta</th>
                  <th className="py-3 pr-4 font-medium">Treino</th>
                  <th className="py-3 pr-4 font-medium">Quando</th>
                  <th className="py-3 pr-4 font-medium">Origem</th>
                  <th className="py-3 pr-4 font-medium">Aderência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.recentExecutions.map((e) => (
                  <tr key={e.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pr-4 font-medium">{e.athlete.name ?? e.athlete.email}</td>
                    <td className="py-3 pr-4">{e.assignment.workout?.title ?? "Treino agendado"}</td>
                    <td className="py-3 pr-4 text-foreground/60">{formatDate(e.startedAt)}</td>
                    <td className="py-3 pr-4 text-foreground/60 capitalize">{e.source}</td>
                    <td className="py-3 pr-4 tabular-nums">
                      {e.compliance ? `${(e.compliance.overallScore / 10).toFixed(1)}/10` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
