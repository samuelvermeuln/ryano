import { AppShell } from "@/components/app-shell";
import { buildNoIndexMetadata } from "@/server/seo";
import { GarminConnectForm } from "@/components/integrations/garmin-connect-form";
import { WhatsAppActivationCard } from "@/components/integrations/whatsapp-activation-card";
import { OnboardingForm } from "@/components/profile/onboarding-form";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { requireUserRecord } from "@/server/auth-guards";

export const metadata = buildNoIndexMetadata({
  title: "Onboarding",
  description: "Fluxo autenticado de ativação da conta RYANO.",
  path: "/onboarding",
});

const navigation = [
  { href: "/onboarding", label: "Onboarding", subtitle: "Concluir ativação", icon: "onboarding" as const },
  { href: "/app/dashboard", label: "Dashboard", subtitle: "Após concluir", icon: "dashboard" as const },
  { href: "/app/integracoes", label: "Integrações", subtitle: "Garmin e WhatsApp", icon: "integrations" as const },
];

export default async function OnboardingPage() {
  const user = await requireUserRecord();
  const garminConnection = user.wearableConnections.find((connection) => connection.provider === "GARMIN") ?? null;

  const steps = [
    {
      id: "step-1",
      number: "01",
      title: "Conta",
      description: "Nome e email da conta.",
      complete: Boolean(user.name && user.email),
    },
    {
      id: "step-2",
      number: "02",
      title: "Dados pessoais",
      description: "CPF, telefone, altura e peso.",
      complete: Boolean(
        user.profile?.cpfEncrypted &&
          user.profile.phoneE164 &&
          user.profile.heightCm &&
          user.profile.weightKg,
      ),
    },
    {
      id: "step-3",
      number: "03",
      title: "Endereço",
      description: "CEP, logradouro, cidade, UF e país.",
      complete: Boolean(
        user.address?.postalCode &&
          user.address.street &&
          user.address.number &&
          user.address.district &&
          user.address.city &&
          user.address.state &&
          user.address.country,
      ),
    },
    {
      id: "step-4",
      number: "04",
      title: "Garmin",
      description: "Conectar conta e iniciar sync inicial.",
      complete: garminConnection?.status === "CONNECTED",
    },
    {
      id: "step-5",
      number: "05",
      title: "WhatsApp",
      description: "Gerar link e validar retorno do webhook.",
      complete: Boolean(user.whatsappIdentity?.verifiedAt),
    },
  ];

  const completedSteps = steps.filter((step) => step.complete).length;
  const isFullyActivated = completedSteps === steps.length;

  return (
    <AppShell mode="app" navigation={navigation} userName={user.name ?? user.email}>
      <SectionCard
        title="Ativação da conta"
        description="Fluxo V1 com cinco etapas. A conta libera dashboard após dados básicos, mas ativação completa inclui Garmin e WhatsApp."
        action={
          <StatusBadge tone={isFullyActivated ? "success" : "warning"}>
            {`${completedSteps}/${steps.length} etapas`}
          </StatusBadge>
        }
      >
        <div className="grid gap-3 xl:grid-cols-5">
          {steps.map((step) => (
            <a
              key={step.id}
              href={`#${step.id}`}
              className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 transition hover:bg-white/8"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold tracking-[0.22em] text-foreground/42">{step.number}</p>
                <StatusBadge tone={step.complete ? "success" : "warning"}>
                  {step.complete ? "OK" : "Pendente"}
                </StatusBadge>
              </div>
              <p className="mt-4 text-sm font-semibold text-foreground">{step.title}</p>
              <p className="mt-2 text-sm leading-6 text-foreground/62">{step.description}</p>
            </a>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Etapas 1 a 3 — conta, dados pessoais e endereço"
        description="Campos obrigatórios para liberar uso principal da aplicação. Dados ausentes do Google precisam ser completados manualmente."
        action={<StatusBadge tone={steps[0].complete && steps[1].complete && steps[2].complete ? "success" : "warning"}>{steps[0].complete && steps[1].complete && steps[2].complete ? "Base concluída" : "Base pendente"}</StatusBadge>}
      >
        <div id="step-1">
          <OnboardingForm
            user={{
              name: user.name,
              email: user.email,
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
        </div>
      </SectionCard>

      <SectionCard
        title="Etapa 4 — Garmin"
        description="Conecte conta Garmin para validar credenciais, sincronizar atividades e completar integração principal da V1."
        action={<StatusBadge tone={garminConnection?.status === "CONNECTED" ? "success" : "warning"}>{garminConnection?.status ?? "Pendente"}</StatusBadge>}
      >
        <div id="step-4">
          <GarminConnectForm
            connection={
              garminConnection
                ? {
                    status: garminConnection.status,
                    lastSyncAt: garminConnection.lastSyncAt,
                    lastSyncStatus: garminConnection.lastSyncStatus,
                  }
                : null
            }
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Etapa 5 — WhatsApp"
        description="Gere link, envie mensagem pelo número cadastrado e aguarde confirmação do webhook para verificar identidade."
        action={<StatusBadge tone={user.whatsappIdentity?.verifiedAt ? "success" : "warning"}>{user.whatsappIdentity?.verifiedAt ? "Verificado" : "Pendente"}</StatusBadge>}
      >
        <div id="step-5">
          <WhatsAppActivationCard phone={user.profile?.phoneE164 ?? null} verified={Boolean(user.whatsappIdentity?.verifiedAt)} />
        </div>
      </SectionCard>
    </AppShell>
  );
}
