/**
 * T263 — Tela de convites
 * T264 — Geração/copiar link
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import { InviteLinksPanel, type InviteRow } from "./invite-links-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

function isUsable(invite: InviteRow): boolean {
  return (
    invite.status === "ACTIVE" && (!invite.expiresAt || new Date(invite.expiresAt).getTime() >= Date.now())
  );
}

function expiresWithinAWeek(invite: InviteRow): boolean {
  if (!invite.expiresAt) return false;
  return new Date(invite.expiresAt).getTime() - Date.now() < 7 * 86_400_000;
}

export default async function ConvitesPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;

  const invites = await prisma.invitationLink.findMany({
    where: { schoolId },
    // tokenHash is deliberately absent: it never leaves the server, and the
    // raw token it hashes is shown only once, at creation.
    select: {
      id: true, type: true, status: true, requiresApproval: true,
      expiresAt: true, maxUses: true, usedCount: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const rows: InviteRow[] = invites.map((invite) => ({
    id: invite.id,
    type: invite.type,
    status: invite.status,
    requiresApproval: invite.requiresApproval,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    maxUses: invite.maxUses,
    usedCount: invite.usedCount,
    createdAt: invite.createdAt.toISOString(),
  }));

  const active = rows.filter(isUsable);
  const totalUses = rows.reduce((sum, invite) => sum + invite.usedCount, 0);
  const expiringSoon = active.filter(expiresWithinAWeek).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Convites</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Crie links para atletas e professores entrarem na escola. Quem entra por um convite que
          exige aprovação aparece em Solicitações.
        </p>
      </div>

      <StatTiles
        items={[
          { label: "Convites ativos", value: active.length },
          { label: "Pessoas que entraram", value: totalUses, hint: "Somando todos os convites" },
          {
            label: "Expiram em 7 dias",
            value: expiringSoon,
            tone: expiringSoon > 0 ? "warning" : "neutral",
          },
        ]}
      />

      <SectionCard
        title="Links de convite"
        description="O link completo aparece só no momento da criação — ele não fica armazenado."
      >
        <InviteLinksPanel schoolId={schoolId} invites={rows} />
      </SectionCard>
    </div>
  );
}
