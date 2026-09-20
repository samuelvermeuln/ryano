/**
 * T255 — Tela professores
 * Lista todos os coaches ativos/históricos da escola com contagem de atletas.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

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
    <div className="p-6 md:p-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Professores</h1>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {coaches.map((cm) => (
          <li key={cm.id} className="rounded-xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center gap-3">
              {cm.coach.user.image && (
                <img src={cm.coach.user.image} alt="" className="w-9 h-9 rounded-full object-cover" />
              )}
              <div>
                <p className="font-medium leading-tight">{cm.coach.user.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{cm.coach.user.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{cm.coach._count.assignments} prescrições</span>
              <span className={`text-xs rounded px-2 py-0.5 ${cm.status === "ACTIVE" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                {cm.status === "ACTIVE" ? "Ativo" : "Encerrado"}
              </span>
            </div>
          </li>
        ))}
        {coaches.length === 0 && (
          <li className="col-span-full text-center text-muted-foreground py-8">Nenhum professor encontrado.</li>
        )}
      </ul>
    </div>
  );
}
