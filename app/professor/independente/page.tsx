/**
 * /professor/independente — Painel do coach independente (sem escola)
 *
 * Permite criar convites do tipo COACH (link pessoal) para convidar atletas
 * sem vínculo com nenhuma escola. O link gerado pode ser copiado e enviado.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { prisma } from "@/server/db";
import { IndependentCoachPanel } from "./independent-coach-panel";

export const dynamic = "force-dynamic";

export default async function ProfessorIndependentePage() {
  if (!isSchoolModuleEnabled()) redirect("/app/dashboard");
  const session = await requireOnboardedSession();

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, displayName: true, status: true },
  });

  if (!profile) redirect("/professor");

  // Busca convites COACH ativos/vigentes criados por este usuário (sem schoolId)
  const invitations = await prisma.invitationLink.findMany({
    where: {
      createdBy: session.user.id,
      type: "COACH",
      schoolId: null,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      expiresAt: true,
      maxUses: true,
      usedCount: true,
      requiresApproval: true,
      createdAt: true,
    },
  });

  // Atletas atualmente atribuídos a este coach (sem escola)
  const athletes = await prisma.coachAthleteAssignment.findMany({
    where: { coachId: profile.id, schoolId: null, status: "ACTIVE", endedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      startedAt: true,
              athlete: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  return (
    <main className="min-h-screen p-6 md:p-12">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/professor" className="text-muted-foreground hover:text-foreground text-sm">← Voltar</Link>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Coach independente</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gere links de convite para seus atletas. Eles se vinculam a você sem precisar de uma escola.
          </p>
        </div>

        <IndependentCoachPanel
          coachId={profile.id}
          invitations={invitations.map((inv) => ({
            id: inv.id,
            status: inv.status,
            expiresAt: inv.expiresAt?.toISOString() ?? null,
            maxUses: inv.maxUses,
            usedCount: inv.usedCount,
            requiresApproval: inv.requiresApproval,
            createdAt: inv.createdAt.toISOString(),
          }))}
          athletes={athletes.map((a) => ({
            assignmentId: a.id,
            startedAt: a.startedAt?.toISOString() ?? null,
            name: a.athlete.name ?? a.athlete.email,
            email: a.athlete.email,
          }))}
        />
      </div>
    </main>
  );
}
