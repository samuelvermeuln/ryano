import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { MOVED_FROM_SCHOOL_REASON } from "@/modules/school/domain/coach-athlete-assignment";
import { buildNoIndexMetadata } from "@/server/seo";
import { CoachDiscovery, type CoachCardData, type ViewerAssignment } from "./coach-discovery";

export const metadata = buildNoIndexMetadata({
  title: "Encontrar professor — Ryvano",
  description: "Encontre professores e treinadores na plataforma Ryvano.",
  path: "/app/professor",
});

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ professor?: string }> };

const COACH_CARD_SELECT = {
  id: true,
  displayName: true,
  bio: true,
  user: { select: { image: true } },
  schoolMemberships: {
    where: { status: "ACTIVE", endedAt: null, suspendedAt: null, school: { status: "ACTIVE" } },
    select: { school: { select: { id: true, name: true } } },
    take: 5,
  },
  _count: { select: { athleteAssignments: { where: { status: "ACTIVE" } } } },
} as const;

/**
 * SAM-25 — descoberta de professores no contexto Atleta.
 *
 * O servidor entrega a lista inicial (professores ativos) e os pedidos/vínculos
 * abertos do próprio atleta com cada um; a busca por nome ou e-mail, o modal de
 * perfil e o pedido de acompanhamento acontecem no cliente contra
 * `/api/coaches/search`, `/api/coaches/[id]/profile` e
 * `/api/coaches/[id]/athlete-requests`.
 *
 * SAM-30 — `?professor=<coachId>` (link da notificação de proposta) abre o
 * perfil desse professor já na chegada, com a proposta para confirmar.
 */
export default async function DiscoverProfessorPage({ searchParams }: PageProps) {
  const session = await requireOnboardedSession();
  const enabled = isSchoolModuleEnabled();
  const { professor: requestedCoachId } = await searchParams;

  const [coaches, assignments] = enabled
    ? await Promise.all([
        prisma.coachProfile.findMany({
          where: { status: "ACTIVE" },
          select: COACH_CARD_SELECT,
          orderBy: { displayName: "asc" },
          take: 60,
        }),
        prisma.coachAthleteAssignment.findMany({
          where: { athleteId: session.user.id, status: { in: ["PENDING", "ACTIVE"] } },
          select: { id: true, coachId: true, schoolId: true, status: true, reason: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [[], []];

  // The linked coach may sit beyond the first page of the listing.
  const linked = enabled && requestedCoachId && !coaches.some((coach) => coach.id === requestedCoachId)
    ? await prisma.coachProfile.findUnique({ where: { id: requestedCoachId, status: "ACTIVE" }, select: COACH_CARD_SELECT })
    : null;

  const initialCoaches: CoachCardData[] = [...(linked ? [linked] : []), ...coaches].map((coach) => ({
    id: coach.id,
    displayName: coach.displayName,
    bio: coach.bio,
    image: coach.user.image,
    schools: coach.schoolMemberships.map((link) => link.school),
    activeAthleteCount: coach._count.athleteAssignments,
  }));

  const viewerAssignments: Record<string, ViewerAssignment> = {};
  for (const assignment of assignments) {
    // ACTIVE wins over a PENDING row for the same coach (different scopes).
    const current = viewerAssignments[assignment.coachId];
    if (!current || assignment.status === "ACTIVE") {
      viewerAssignments[assignment.coachId] = {
        id: assignment.id,
        status: assignment.status === "ACTIVE" ? "ACTIVE" : "PENDING",
        kind: assignment.reason === MOVED_FROM_SCHOOL_REASON ? "proposal" : "request",
        schoolId: assignment.schoolId,
        requestedAt: assignment.createdAt.toISOString(),
      };
    }
  }

  return (
    <div className="space-y-6">
      <CoachDiscovery
        initialCoaches={initialCoaches}
        viewerAssignments={viewerAssignments}
        enabled={enabled}
        initialOpenCoachId={initialCoaches.some((coach) => coach.id === requestedCoachId) ? requestedCoachId ?? null : null}
      />
    </div>
  );
}
