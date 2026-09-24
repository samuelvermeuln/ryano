/**
 * T263 — Tela de convites
 * T264 — Geração/copiar link
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { InviteLinksPanel } from "./invite-links-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function ConvitesPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;

  const invites = await prisma.invitationLink.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Convites</h1>
      <InviteLinksPanel schoolId={schoolId} invites={invites} />
    </div>
  );
}
