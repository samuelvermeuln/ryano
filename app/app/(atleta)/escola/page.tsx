import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { buildNoIndexMetadata } from "@/server/seo";
import { SchoolDiscovery, type SchoolCardData, type ViewerMembership } from "./school-discovery";

export const metadata = buildNoIndexMetadata({
  title: "Encontrar escola — Ryvano",
  description: "Encontre e conecte-se a escolas esportivas na plataforma Ryvano.",
  path: "/app/escola",
});

export const dynamic = "force-dynamic";

/**
 * SAM-24 — descoberta de escolas no contexto Atleta.
 *
 * O servidor entrega a lista inicial (escolas ativas) e o estado do vínculo do
 * próprio atleta com cada uma; a busca, o modal de perfil e o pedido de vínculo
 * acontecem no cliente contra `/api/schools/search`, `/api/schools/[id]/profile`
 * e `POST /api/schools/[id]/athletes`.
 */
export default async function DiscoverEscolaPage() {
  const session = await requireOnboardedSession();
  const enabled = isSchoolModuleEnabled();

  const [schools, memberships] = enabled
    ? await Promise.all([
        prisma.school.findMany({
          where: { status: "ACTIVE" },
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            logoUrl: true,
            city: true,
            state: true,
            sportTypes: true,
            joinPolicy: true,
            coachSelectionPolicy: true,
            _count: { select: { athleteMemberships: { where: { status: "ACTIVE" } } } },
          },
          orderBy: { name: "asc" },
          take: 60,
        }),
        prisma.schoolAthleteMembership.findMany({
          where: { athleteId: session.user.id, status: { in: ["PENDING", "ACTIVE"] } },
          select: { schoolId: true, status: true, createdAt: true },
        }),
      ])
    : [[], []];

  const initialSchools: SchoolCardData[] = schools.map((school) => ({
    id: school.id,
    slug: school.slug,
    name: school.name,
    description: school.description,
    logoUrl: school.logoUrl,
    city: school.city,
    state: school.state,
    sportTypes: school.sportTypes,
    activeAthleteCount: school._count.athleteMemberships,
    joinPolicy: school.joinPolicy,
    coachSelectionPolicy: school.coachSelectionPolicy,
  }));

  const viewerMemberships: Record<string, ViewerMembership> = {};
  for (const membership of memberships) {
    // ACTIVE wins over a stale PENDING row for the same school.
    const current = viewerMemberships[membership.schoolId];
    if (!current || membership.status === "ACTIVE") {
      viewerMemberships[membership.schoolId] = {
        status: membership.status === "ACTIVE" ? "ACTIVE" : "PENDING",
        requestedAt: membership.createdAt.toISOString(),
      };
    }
  }

  return (
    <div className="space-y-6">
      <SchoolDiscovery initialSchools={initialSchools} viewerMemberships={viewerMemberships} enabled={enabled} />
    </div>
  );
}
