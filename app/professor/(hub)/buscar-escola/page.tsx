/**
 * /professor/buscar-escola — busca escola e solicita vínculo como professor
 *
 * Requer CoachProfile ativo. Redireciona para /professor se não tiver.
 */
import { redirect } from "next/navigation";
import { PAGE_CLASS, PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { prisma } from "@/server/db";
import { CoachSchoolSearchPanel } from "./coach-school-search-panel";

export const dynamic = "force-dynamic";

export default async function ProfessorBuscarEscolaPage() {
  if (!isSchoolModuleEnabled()) redirect("/app/dashboard");
  const session = await requireOnboardedSession();

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, status: true },
  });

  // Sem perfil → onboarding
  if (!profile) redirect("/professor");

  // Carrega IDs de escolas que o coach já tem vínculo (para desabilitar na busca)
  const existingSchoolIds = await prisma.coachSchoolMembership.findMany({
    where: { coachId: profile.id, status: { in: ["PENDING", "ACTIVE"] }, endedAt: null },
    select: { schoolId: true },
  }).then((rows) => rows.map((r) => r.schoolId));

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Vincular a uma escola"
        description="Busque uma escola pelo nome e solicite sua entrada como professor. A escola precisará aprovar seu pedido."
      />

      <SectionCard title="Buscar escola" description="Escolas que aceitam somente convite aparecem, mas não recebem pedido.">
        <CoachSchoolSearchPanel existingSchoolIds={existingSchoolIds} />
      </SectionCard>
    </div>
  );
}
