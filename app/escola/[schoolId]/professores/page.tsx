/**
 * T255 — Tela professores
 * Lista todos os coaches ativos/históricos da escola, com contagem de
 * prescrições e acesso à ficha individual.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { InviteCoachForm } from "./coach-actions";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function ProfessoresPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;

  const coaches = await prisma.coachSchoolMembership.findMany({
    where: { schoolId },
    include: {
      coach: {
        include: {
          user: { select: { name: true, email: true, image: true } },
          _count: {
            select: {
              assignments: { where: { schoolId } },
              athleteAssignments: { where: { schoolId, status: "ACTIVE" } },
            },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  const active = coaches.filter((cm) => cm.status === "ACTIVE");
  const past = coaches.filter((cm) => cm.status !== "ACTIVE");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Professores</h1>
          <p className="text-sm text-foreground/50 mt-1">
            {active.length === 0
              ? "Nenhum professor ativo."
              : `${active.length} ${active.length === 1 ? "professor ativo" : "professores ativos"}`}
          </p>
        </div>
        <InviteCoachForm schoolId={schoolId} />
      </div>

      {coaches.length === 0 ? (
        <EmptyState
          title="Esta escola ainda não tem professores"
          description="Convide um professor para que ele aceite o vínculo e passe a prescrever treinos."
        />
      ) : (
        <SectionCard title={`Ativos (${active.length})`}>
          {active.length === 0 ? (
            <p className="text-center text-sm text-foreground/40 py-8">Nenhum professor ativo.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((cm) => (
                <li key={cm.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 space-y-3">
                  <Link href={`/escola/${schoolId}/professores/${cm.id}`} className="flex items-center gap-3 group">
                    {cm.coach.user.image && (
                      <img src={cm.coach.user.image} alt="" className="w-9 h-9 rounded-full object-cover" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium leading-tight truncate group-hover:underline">
                        {cm.coach.user.name ?? cm.coach.displayName ?? "—"}
                      </p>
                      <p className="text-xs text-foreground/50 truncate">{cm.coach.user.email}</p>
                    </div>
                  </Link>
                  <dl className="flex items-center gap-4 text-xs text-foreground/55">
                    <div>
                      <dt className="sr-only">Prescrições</dt>
                      <dd>{cm.coach._count.assignments} prescrições</dd>
                    </div>
                    <div>
                      <dt className="sr-only">Atletas</dt>
                      <dd>{cm.coach._count.athleteAssignments} atletas</dd>
                    </div>
                  </dl>
                  <Link
                    href={`/escola/${schoolId}/professores/${cm.id}`}
                    className="inline-block text-xs font-medium hover:underline"
                  >
                    Ver ficha →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {past.length > 0 && (
        <SectionCard title={`Encerrados (${past.length})`}>
          <ul className="divide-y divide-white/5">
            {past.map((cm) => (
              <li key={cm.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <Link href={`/escola/${schoolId}/professores/${cm.id}`} className="font-medium hover:underline">
                  {cm.coach.user.name ?? cm.coach.user.email}
                </Link>
                <span className="flex items-center gap-3 text-xs text-foreground/50">
                  {cm.endedAt && <span>até {new Date(cm.endedAt).toLocaleDateString("pt-BR")}</span>}
                  <StatusBadge tone="neutral">Encerrado</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
