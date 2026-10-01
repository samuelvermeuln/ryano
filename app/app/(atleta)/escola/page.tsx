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
type PageProps = { searchParams: Promise<{ school?: string; coach?: string }> };

const SCHOOL_CARD_SELECT = {
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
  _count: { select: { athleteMemberships: { where: { status: "ACTIVE" as const } } } },
} as const;

export default async function DiscoverEscolaPage({ searchParams }: PageProps) {
  const session = await requireOnboardedSession();
  const enabled = isSchoolModuleEnabled();
  // SAM-29 — "seguir professor": the notification deep-links to one school with
  // the coach pre-selected; the modal opens on arrival.
  const { school: openSchoolId, coach: preferredCoachId } = await searchParams;

  const [listed, memberships, linked] = enabled
    ? await Promise.all([
        prisma.school.findMany({
          where: { status: "ACTIVE" },
          select: SCHOOL_CARD_SELECT,
          orderBy: { name: "asc" },
          take: 60,
        }),
        prisma.schoolAthleteMembership.findMany({
          where: { athleteId: session.user.id, status: { in: ["PENDING", "ACTIVE", "REJECTED"] } },
          select: { schoolId: true, status: true, createdAt: true, updatedAt: true },
          orderBy: { createdAt: "asc" },
        }),
        openSchoolId
          ? prisma.school.findFirst({ where: { id: openSchoolId, status: "ACTIVE" }, select: SCHOOL_CARD_SELECT })
          : Promise.resolve(null),
      ])
    : [[], [], null];
  // The deep-linked school is shown even when it falls outside the first page of the list.
  const schools = linked && !listed.some((school) => school.id === linked.id) ? [linked, ...listed] : listed;

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

  // Rows arrive oldest first, so the last one for a school is the latest; an
  // ACTIVE link always wins, a PENDING request beats an older REJECTED one.
  const RANK = { REJECTED: 0, PENDING: 1, ACTIVE: 2 } as const;
  const viewerMemberships: Record<string, ViewerMembership> = {};
  for (const membership of memberships) {
    const status = membership.status as keyof typeof RANK;
    const current = viewerMemberships[membership.schoolId];
    if (!current || RANK[status] >= RANK[current.status]) {
      viewerMemberships[membership.schoolId] = {
        status,
        requestedAt: membership.createdAt.toISOString(),
        decidedAt: status === "REJECTED" ? membership.updatedAt.toISOString() : null,
      };
    }
  }

  return (
    <div className="space-y-6">
      <SchoolDiscovery
        initialSchools={initialSchools}
        viewerMemberships={viewerMemberships}
        enabled={enabled}
        initialOpenSchoolId={linked?.id ?? null}
        initialPreferredCoachId={preferredCoachId ?? null}
      />
    </div>
  );
}
