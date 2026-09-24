/**
 * T255 — Tela professores
 * Lista todos os coaches ativos/históricos da escola com contagem de atletas.
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";

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
          _count: { select: { assignments: { where: { schoolId } } } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <SectionCard title="Professores">
        {coaches.length === 0 ? (
          <p className="text-center text-sm text-foreground/40 py-8">Nenhum professor encontrado.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {coaches.map((cm) => (
              <li key={cm.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 space-y-2">
                <div className="flex items-center gap-3">
                  {cm.coach.user.image && (
                    <img src={cm.coach.user.image} alt="" className="w-9 h-9 rounded-full object-cover" />
                  )}
                  <div>
                    <p className="font-medium leading-tight">{cm.coach.user.name ?? "—"}</p>
                    <p className="text-xs text-foreground/50">{cm.coach.user.email}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground/55">{cm.coach._count.assignments} prescrições</span>
                  <StatusBadge tone={cm.status === "ACTIVE" ? "success" : "neutral"}>
                    {cm.status === "ACTIVE" ? "Ativo" : "Encerrado"}
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
