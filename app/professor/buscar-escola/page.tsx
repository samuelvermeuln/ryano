/**
 * /professor/buscar-escola — busca escola e solicita vínculo como professor
 *
 * Requer CoachProfile ativo. Redireciona para /professor se não tiver.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
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
    <main className="min-h-screen p-6 md:p-12">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/professor" className="text-muted-foreground hover:text-foreground text-sm">← Voltar</Link>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Vincular a uma escola</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Busque uma escola pelo nome e solicite sua entrada como professor.
            A escola precisará aprovar seu pedido.
          </p>
        </div>

        <CoachSchoolSearchPanel existingSchoolIds={existingSchoolIds} />
      </div>
    </main>
  );
}
