import { DeliveryStatus } from "@prisma/client";

import { SectionCard } from "@/components/section-card";
import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { getStoredGarminReportingSettings } from "@/modules/garmin";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireAdmin();

  const [
    userCount,
    onboardingCount,
    garminCount,
    whatsappVerifiedCount,
    pendingDeliveries,
    failedDeliveries,
    sentLastHour,
    garminSettings,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userProfile.count({ where: { onboardingCompletedAt: { not: null } } }),
    prisma.wearableConnection.count({ where: { provider: "GARMIN", status: "CONNECTED" } }),
    prisma.whatsAppIdentity.count({ where: { verifiedAt: { not: null } } }),
    prisma.messageDelivery.count({
      where: {
        channel: "WHATSAPP",
        provider: "EVOLUTION",
        status: DeliveryStatus.PENDING,
      },
    }),
    prisma.messageDelivery.count({
      where: {
        channel: "WHATSAPP",
        provider: "EVOLUTION",
        status: DeliveryStatus.FAILED,
      },
    }),
    prisma.messageDelivery.count({
      where: {
        channel: "WHATSAPP",
        provider: "EVOLUTION",
        status: {
          in: [DeliveryStatus.SENT, DeliveryStatus.DELIVERED],
        },
        sentAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000),
        },
      },
    }),
    getStoredGarminReportingSettings(),
  ]);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="Visão geral" description="Resumo rápido das contas e conexões ativas.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric title="Usuários" value={String(userCount)} />
          <Metric title="Configuração concluída" value={String(onboardingCount)} />
          <Metric title="Garmin conectada" value={String(garminCount)} />
          <Metric title="WhatsApp verificado" value={String(whatsappVerifiedCount)} />
          <Metric title="Fila pendente" value={String(pendingDeliveries)} />
          <Metric title="Falhas WhatsApp" value={String(failedDeliveries)} />
          <Metric title="Enviadas na última hora" value={String(sentLastHour)} />
          <Metric title="Envios globais" value={garminSettings.whatsappDispatchPaused ? "Pausados" : "Ativos"} />
        </div>
      </SectionCard>

      <SectionCard title="Pontos de atenção" description="Lembretes úteis para acompanhar a conta e as integrações.">
        <div className="space-y-3 text-sm leading-7 text-foreground/72">
          <p>Somente administradores devem acessar estas páginas.</p>
          <p>Revise falhas de conexão e mensagens pendentes com frequência.</p>
          <p>Use este painel para acompanhar contas, integrações e confirmações do WhatsApp.</p>
          <p>Limites atuais do disparo: {garminSettings.maxMessagesPerRun} por execução, {garminSettings.maxMessagesPerHour}/hora e {garminSettings.maxMessagesPerDay}/dia.</p>
          <p>Quando algo sair do esperado, registre o ocorrido e acompanhe a solução.</p>
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
