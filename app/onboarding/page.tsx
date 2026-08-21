import { AppShell } from "@/components/app-shell";
import { MobileDock } from "@/components/mobile-dock";
import { OnboardingWizard } from "@/components/profile/onboarding-wizard";
import { decryptSecret, type EncryptedSecret } from "@/server/crypto/secret-vault";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireUserRecord } from "@/server/auth-guards";

export const metadata = buildNoIndexMetadata({
  title: "Configuração inicial",
  description: "Complete sua conta e conecte seus treinos no ryvano.",
  path: "/onboarding",
});

const navigation = [
  { href: "/onboarding", label: "Configuração", icon: "onboarding" as const },
  { href: "/app/dashboard", label: "Dashboard", icon: "dashboard" as const },
  { href: "/app/integracoes", label: "Integrações", icon: "integrations" as const },
] as const;

const mobileDockItems = [
  { href: "#step-1", label: "Conta", icon: "profile", kind: "anchor" },
  { href: "#step-2", label: "Perfil", icon: "onboarding", kind: "anchor" },
  { href: "#step-4", label: "Garmin", icon: "integrations", kind: "anchor" },
  { href: "#step-5", label: "WhatsApp", icon: "whatsapp", kind: "anchor" },
] as const;

export default async function OnboardingPage() {
  const user = await requireUserRecord();
  const garminConnection = user.wearableConnections.find((connection) => connection.provider === "GARMIN") ?? null;
  const cpf = user.profile?.cpfEncrypted
    ? decryptSecret(JSON.parse(user.profile.cpfEncrypted) as EncryptedSecret)
    : null;

  const steps = [
    {
      id: "step-1",
      number: "1",
      title: "Conta",
      description: "Nome e e-mail",
      complete: Boolean(user.name && user.email),
    },
    {
      id: "step-2",
      number: "2",
      title: "Perfil",
      description: "Telefone e dados físicos",
      complete: Boolean(
        user.profile?.cpfEncrypted &&
          user.profile.phoneE164 &&
          user.profile.heightCm &&
          user.profile.weightKg,
      ),
    },
    {
      id: "step-3",
      number: "3",
      title: "Endereço",
      description: "Onde você mora",
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
      number: "4",
      title: "Garmin",
      description: "Conecte seus treinos",
      complete: garminConnection?.status === "CONNECTED",
    },
    {
      id: "step-5",
      number: "5",
      title: "WhatsApp",
      description: "Receba seus relatórios",
      complete: Boolean(user.whatsappIdentity?.verifiedAt),
    },
  ] as const;

  const initialStepId = steps.find((step) => !step.complete)?.id ?? steps[steps.length - 1]?.id ?? "step-1";

  return (
    <AppShell
      mode="app"
      navigation={navigation}
      userName={user.name ?? user.email}
      userImage={user.image}
      mobileDock={<MobileDock variant="custom" items={mobileDockItems} user={{ name: user.name ?? user.email, image: user.image }} />}
    >
      <OnboardingWizard
        steps={steps}
        initialStepId={initialStepId}
        user={{
          name: user.name,
          email: user.email,
          cpf,
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
        garminConnection={
          garminConnection
            ? {
                status: garminConnection.status,
                lastSyncAt: garminConnection.lastSyncAt,
                lastSyncStatus: garminConnection.lastSyncStatus,
              }
            : null
        }
        whatsapp={{
          phone: user.profile?.phoneE164 ?? null,
          verified: Boolean(user.whatsappIdentity?.verifiedAt),
        }}
      />
    </AppShell>
  );
}
