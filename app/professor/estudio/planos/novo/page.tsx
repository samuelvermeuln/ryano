/**
 * TM029 — /professor/estudio/planos/novo: editor estruturado para criar um
 * plano novo (RF-102). Server component só resolve sessão/dados de apoio
 * (escolas administráveis para a decisão Q3, biblioteca de templates do
 * autor); toda a interação (criar rascunho, montar semanas/dias/sessões,
 * preview, publicar) vive em `NewPlanWizard` (client component), que fala
 * com as rotas TM024/TM025/TM026.
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { NewPlanWizard } from "./new-plan-wizard";

export const dynamic = "force-dynamic";

export default async function NovoPlanoPage() {
  if (!isMarketplaceEnabled()) notFound();
  const session = await requireOnboardedSession({ next: "/professor/estudio/planos/novo" });

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, status: true },
  });
  if (!coachProfile) redirect("/professor");
  if (coachProfile.status !== "ACTIVE") notFound();

  // TM019/Q3 — schools where this actor may publish IN THE SCHOOL'S NAME
  // (OWNER/ADMIN, same bar as CanManageTrainingProduct/TM018). The wizard
  // lets the coach pick "em meu nome" vs one of these per product.
  const managedMemberships = await prisma.schoolMembership.findMany({
    where: {
      userId: session.user.id, status: "ACTIVE", endedAt: null,
      roles: { some: { role: { in: ["OWNER", "ADMIN"] } } },
      school: { status: "ACTIVE" },
    },
    select: { school: { select: { id: true, name: true } } },
  });
  const manageableSchools = managedMemberships.map((m) => m.school);
  const manageableSchoolIds = manageableSchools.map((s) => s.id);

  // Biblioteca de templates disponível para montar sessões (RF-102): os do
  // próprio coach + os de qualquer escola onde ele é OWNER/ADMIN. TM022
  // reforça o mesmo vínculo no momento de publicar.
  const [personalTemplates, schoolTemplates] = await Promise.all([
    prisma.workoutTemplate.findMany({
      where: { authorCoachId: coachProfile.id, ownerType: "COACH", status: { not: "ARCHIVED" } },
      select: { id: true, title: true, sportType: true },
      orderBy: { title: "asc" },
    }),
    manageableSchoolIds.length > 0
      ? prisma.workoutTemplate.findMany({
        where: { schoolId: { in: manageableSchoolIds }, ownerType: "SCHOOL", status: { not: "ARCHIVED" } },
        select: { id: true, title: true, sportType: true, schoolId: true },
        orderBy: { title: "asc" },
      })
      : Promise.resolve([]),
  ]);

  return (
    <main className="min-h-screen p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/professor/estudio/planos" className="text-muted-foreground hover:text-foreground text-sm">
            ← Meus planos
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Novo plano</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monte semanas, dias e sessões a partir da sua biblioteca de templates. Você pode salvar como
            rascunho e publicar quando estiver pronto.
          </p>
        </div>

        {personalTemplates.length === 0 && schoolTemplates.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Você ainda não tem nenhum template de treino cadastrado. Crie templates no seu painel de treinos
            antes de montar um plano — cada sessão do plano referencia um template existente.
          </div>
        )}

        <NewPlanWizard
          manageableSchools={manageableSchools}
          templates={[
            ...personalTemplates.map((t) => ({ ...t, ownerLabel: "Meus templates" as const })),
            ...schoolTemplates.map((t) => ({ ...t, ownerLabel: "Templates da escola" as const })),
          ]}
        />
      </div>
    </main>
  );
}
