import { PreferencesForm } from "@/components/profile/preferences-form";
import { SectionCard } from "@/components/section-card";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export default async function ReportsPage() {
  const session = await requireOnboardedSession();
  const preference = await prisma.notificationPreference.findUnique({
    where: {
      userId: session.user.id,
    },
    select: {
      enabled: true,
      postActivityReport: true,
      dailySummary: true,
      weeklySummary: true,
      reportTime: true,
      timezone: true,
    },
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <SectionCard
        title="Preferências de relatórios"
        description="Escolha como você quer receber seus resumos e notificações automáticas."
      >
        <PreferencesForm preference={preference} />
      </SectionCard>

      <SectionCard
        title="Como funciona"
        description="Ajustes rápidos para o que a ryvano envia depois de cada treino e ao longo da semana."
      >
        <div className="grid gap-3">
          {[
            ["Pós-atividade", "Resumo automático depois que uma nova atividade é sincronizada."],
            ["Resumo diário", "Consolida dados do dia quando essa automação estiver ativa."],
            ["Resumo semanal", "Envia visão mais ampla da semana de treino."],
            ["Horário", "Define janela principal para entregas automáticas."],
          ].map(([title, description]) => (
            <div key={title} className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-2 text-sm leading-7 text-foreground/68">{description}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
