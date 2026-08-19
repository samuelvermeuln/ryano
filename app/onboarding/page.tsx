import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { OnboardingForm } from "@/components/profile/onboarding-form";
import { StatusBadge } from "@/components/status-badge";
import { requireUserRecord } from "@/server/auth-guards";

const navigation = [
  { href: "/onboarding", label: "Onboarding", subtitle: "Concluir ativação" },
  { href: "/app/dashboard", label: "Dashboard", subtitle: "Após concluir" },
  { href: "/app/integracoes", label: "Integrações", subtitle: "Garmin e WhatsApp" },
];

export default async function OnboardingPage() {
  const user = await requireUserRecord();

  return (
    <AppShell mode="app" navigation={navigation} userName={user.name ?? user.email}>
      <SectionCard
        title="Concluir cadastro obrigatório"
        description="Etapas V1: conta, dados pessoais, endereço, Garmin e WhatsApp. Campos do Google podem chegar pré-preenchidos; dados ausentes precisam ser informados manualmente."
        action={<StatusBadge tone={user.profile?.onboardingCompletedAt ? "success" : "warning"}>{user.profile?.onboardingCompletedAt ? "Concluído" : "Pendente"}</StatusBadge>}
      >
        <OnboardingForm
          user={{
            name: user.name,
            profile: {
              phoneE164: user.profile?.phoneE164 ?? null,
              heightCm: user.profile?.heightCm ?? null,
              weightKg: user.profile?.weightKg?.toString() ?? null,
            },
            address: {
              postalCode: user.address?.postalCode ?? null,
              street: user.address?.street ?? null,
              number: user.address?.number ?? null,
              complement: user.address?.complement ?? null,
              district: user.address?.district ?? null,
              city: user.address?.city ?? null,
              state: user.address?.state ?? null,
              country: user.address?.country ?? null,
            },
          }}
        />
      </SectionCard>

      <SectionCard title="Próximos passos" description="Após concluir dados básicos, continue em integrações e ativação do WhatsApp.">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState title="Etapa Garmin" description="Conectar conta Garmin na área de integrações para iniciar sincronização de atividades." />
          <EmptyState title="Etapa WhatsApp" description="Gerar link de ativação e aguardar verificação do webhook com remetente confiável." />
        </div>
      </SectionCard>
    </AppShell>
  );
}
