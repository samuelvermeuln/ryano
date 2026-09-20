/**
 * /professor — Painel de professor (index)
 *
 * Fluxo:
 *   1. Sem CoachProfile  → formulário de criação (+ explicação sobre professor independente vs escola)
 *   2. Com CoachProfile  → lista escolas vinculadas + ações rápidas
 *      - Escola ACTIVE   → link para /professor/[schoolId]
 *      - Escola PENDING  → aguardando aprovação
 *      - Botão "Vincular a uma escola" → /professor/buscar-escola
 *      - Botão "Coach independente"   → /professor/independente
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { prisma } from "@/server/db";
import { CoachProfilePanel } from "./coach-profile-panel";

export const dynamic = "force-dynamic";

export default async function ProfessorIndexPage() {
  if (!isSchoolModuleEnabled()) redirect("/app/dashboard");
  const session = await requireOnboardedSession({ next: "/professor" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      schoolMemberships: {
        where: { status: { in: ["PENDING", "ACTIVE"] }, endedAt: null },
        include: {
          school: { select: { id: true, name: true, city: true, state: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return (
    <main className="min-h-screen p-6 md:p-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <CoachProfilePanel
          profile={profile ? {
            id: profile.id,
            displayName: profile.displayName,
            bio: profile.bio,
            status: profile.status,
            schools: profile.schoolMemberships.map((m) => ({
              membershipId: m.id,
              membershipStatus: m.status as "PENDING" | "ACTIVE",
              school: {
                id: m.school.id,
                name: m.school.name,
                city: m.school.city,
                state: m.school.state,
                status: m.school.status,
              },
            })),
          } : null}
        />
      </div>
    </main>
  );
}
