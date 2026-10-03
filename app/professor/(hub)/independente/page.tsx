/**
 * /professor/independente — Painel do coach independente (sem escola)
 *
 * Permite criar convites do tipo COACH (link pessoal) para convidar atletas
 * sem vínculo com nenhuma escola. O link gerado pode ser copiado e enviado.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconUsers } from "@tabler/icons-react";
import { PAGE_CLASS, PageHeader, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { StatTiles } from "@/components/stat-tiles";
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

  const pendingApproval = invitations.filter((inv) => inv.requiresApproval).length;
  const totalUses = invitations.reduce((sum, inv) => sum + inv.usedCount, 0);

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Coach independente"
        description="Gere links de convite para seus atletas. Eles se vinculam a você sem precisar de uma escola."
        actions={(
          // SAM-35 — the roster with today's state, compliance and last activity lives in its own list.
          <Link href="/professor/independente/atletas" className={SECONDARY_ACTION_CLASS}>
            <IconUsers size={16} aria-hidden="true" />
            Ver meus atletas
          </Link>
        )}
      />

      <StatTiles
        items={[
          { label: "Atletas", value: athletes.length, hint: "Acompanhados fora de escola" },
          { label: "Convites ativos", value: invitations.length, hint: pendingApproval > 0 ? `${pendingApproval} exige(m) aprovação` : undefined },
          { label: "Usos dos convites", value: totalUses },
        ]}
      />

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
            athleteId: a.athlete.id,
            startedAt: a.startedAt?.toISOString() ?? null,
            name: a.athlete.name ?? a.athlete.email,
            email: a.athlete.email,
          }))}
      />
    </div>
  );
}
