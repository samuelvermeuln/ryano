import { SectionCard } from "@/components/section-card";
import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireAdmin();

  const [userCount, onboardingCount, garminCount, whatsappVerifiedCount] = await Promise.all([
    prisma.user.count(),
    prisma.userProfile.count({ where: { onboardingCompletedAt: { not: null } } }),
    prisma.wearableConnection.count({ where: { provider: "GARMIN", status: "CONNECTED" } }),
    prisma.whatsAppIdentity.count({ where: { verifiedAt: { not: null } } }),
  ]);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="KPIs operacionais" description="Visão inicial para administração da V1.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Metric title="Usuários" value={String(userCount)} />
          <Metric title="Onboarding concluído" value={String(onboardingCount)} />
          <Metric title="Garmin conectada" value={String(garminCount)} />
          <Metric title="WhatsApp verificado" value={String(whatsappVerifiedCount)} />
        </div>
      </SectionCard>

      <SectionCard title="Regras críticas" description="Resumo das garantias esperadas em operações administrativas.">
        <div className="space-y-3 text-sm leading-7 text-foreground/72">
          <p>Secrets não vão para o browser.</p>
          <p>Autorização server-side aplicada em cada rota admin.</p>
          <p>Ações relevantes devem ser auditadas em `AdminAuditLog`.</p>
          <p>QR Code e status Evolution ficam atrás da API interna.</p>
        </div>
      </SectionCard>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-sm text-foreground/55">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}
