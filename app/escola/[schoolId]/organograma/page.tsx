/**
 * Organograma da escola: escola > professores > alunos.
 *
 * O servidor apenas resolve a hierarquia e entrega ao componente cliente, que
 * cuida de zoom, busca, filtros e arrastar-e-soltar.
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetOrganizationChart } from "@/modules/school/application/get-organization-chart";
import { SchoolError } from "@/modules/school/domain/errors";
import { OrganizationChart } from "./organization-chart";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function OrganogramaPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  let chart;
  try {
    chart = await new GetOrganizationChart(prisma).execute(session.user.id, schoolId);
  } catch (error) {
    // The layout already restricts this area to OWNER/ADMIN; a miss here means
    // the school does not exist for this viewer, which is a 404, not a crash.
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Organograma</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Estrutura da escola: professores e alunos vinculados a cada um.
          {chart.canManage
            ? " Arraste um aluno para transferi-lo de professor."
            : " Você pode consultar a estrutura, mas não alterá-la."}
        </p>
      </div>
      <OrganizationChart schoolId={schoolId} initial={chart} />
    </div>
  );
}
