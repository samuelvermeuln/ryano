import { notFound } from "next/navigation";

import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      profile: true,
      address: true,
      whatsappIdentity: true,
      wearableConnections: true,
      notificationPreference: true,
      messageDeliveries: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!user) {
    notFound();
  }

  const garmin = user.wearableConnections.find((connection) => connection.provider === "GARMIN") ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <SectionCard title={user.name ?? user.email} description="Detalhe administrativo do usuário.">
        <div className="grid gap-3">
          <Row label="Email" value={user.email} />
          <Row label="Status" value={user.status} />
          <Row label="Role" value={user.role} />
          <Row label="Onboarding" value={user.profile?.onboardingCompletedAt ? formatDateTime(user.profile.onboardingCompletedAt) : "Pendente"} />
          <Row label="Telefone" value={user.profile?.phoneE164 ?? "—"} />
          <Row label="WhatsApp" value={user.whatsappIdentity?.verifiedAt ? "Verificado" : "Pendente"} />
        </div>
      </SectionCard>

      <SectionCard title="Integrações" description="Estado atual das conexões e da mensageria.">
        <div className="grid gap-3">
          <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-foreground">Garmin</p>
              <StatusBadge tone={garmin?.status === "CONNECTED" ? "success" : garmin ? "warning" : "neutral"}>
                {garmin?.status ?? "Sem conexão"}
              </StatusBadge>
            </div>
            <p className="mt-2 text-sm text-foreground/65">Última sync: {formatDateTime(garmin?.lastSyncAt)}</p>
            <p className="mt-1 text-sm text-foreground/65">Status sync: {garmin?.lastSyncStatus ?? "—"}</p>
          </div>
          <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
            <p className="font-semibold text-foreground">Mensagens recentes</p>
            <div className="mt-3 grid gap-2">
              {user.messageDeliveries.length ? (
                user.messageDeliveries.map((delivery) => (
                  <div key={delivery.id} className="rounded-[16px] border border-white/8 bg-black/10 px-3 py-3 text-sm text-foreground/70">
                    <p>{delivery.type}</p>
                    <p className="mt-1 text-xs text-foreground/55">{delivery.status} · {formatDateTime(delivery.createdAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-foreground/60">Sem deliveries registrados.</p>
              )}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-sm text-foreground/55">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
