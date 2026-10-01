/**
 * /professor — Painel de professor (index)
 *
 * Fluxo:
 *   1. Sem CoachProfile  → formulário de criação (+ explicação sobre professor independente vs escola)
 *   2. Com CoachProfile  → pedidos de acompanhamento pendentes (SAM-26), lista de
 *      escolas vinculadas + ações rápidas
 *      - Escola ACTIVE   → link para /professor/[schoolId]
 *      - Escola PENDING  → aguardando aprovação
 *      - Botão "Vincular a uma escola" → /professor/buscar-escola
 *      - Botão "Coach independente"   → /professor/independente
 */
import { redirect } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { ListCoachAssignmentRequests } from "@/modules/school/application/list-coach-assignment-requests";
import { prisma } from "@/server/db";
import { EmptyState } from "@/components/empty-state";
import { CoachProfilePanel } from "./coach-profile-panel";
import { CoachRequestsPanel, type CoachRequestRow } from "./coach-requests-panel";

export const dynamic = "force-dynamic";

const listRequests = new ListCoachAssignmentRequests(prisma);

export default async function ProfessorIndexPage() {
  if (!isSchoolModuleEnabled()) redirect("/app/dashboard");
  const session = await requireOnboardedSession({ next: "/professor" });

  const [profile, requests] = await Promise.all([
    prisma.coachProfile.findUnique({
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
    }),
    listRequests.execute(session.user.id),
  ]);

  const requestRows: CoachRequestRow[] = requests.map((request) => ({
    id: request.id,
    athleteName: request.athlete.name ?? request.athlete.email,
    athleteEmail: request.athlete.email,
    athleteImage: request.athlete.image,
    schoolId: request.schoolId,
    schoolName: request.schoolName,
    note: request.note,
    requestedAt: request.requestedAt.toISOString(),
    canAccept: request.canAccept,
    blockedReason: request.blockedReason,
  }));

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-8">
        {profile ? (
          <section className="space-y-3" data-testid="coach-requests-section">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
              Pedidos de acompanhamento ({requestRows.length})
            </h2>
            {requestRows.length === 0 ? (
              <EmptyState
                title="Nenhum pedido aguardando você"
                description="Quando um atleta pedir seu acompanhamento em /app/professor, o pedido aparece aqui para você aceitar ou recusar."
              />
            ) : (
              <CoachRequestsPanel requests={requestRows} />
            )}
          </section>
        ) : null}

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
    </div>
  );
}
