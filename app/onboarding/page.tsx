import { AppShell } from "@/components/app-shell";
import { MobileDock } from "@/components/mobile-dock";
import { OnboardingWizard } from "@/components/profile/onboarding-wizard";
import {
  buildIntegrationCards,
  type UserConnectionSummary,
} from "@/modules/shared/integrations/presentation";
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
  { href: "#step-3", label: "Dispositivos", icon: "integrations", kind: "anchor" },
  { href: "#step-4", label: "WhatsApp", icon: "whatsapp", kind: "anchor" },
] as const;

const SAFE_NEXT_PATHS: Record<string, string> = {
  "/professor": "painel do professor",
  "/escola": "painel da escola",
  "/escola/criar": "cadastro da escola",
  "/app/dashboard": "dashboard",
};

function sanitizeNext(raw: string | undefined): { path: string; label: string } | null {
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
  const label = SAFE_NEXT_PATHS[decoded];
  return label ? { path: decoded, label } : null;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextDestination = sanitizeNext(params.next);
  const user = await requireUserRecord();
  const garminConnection = user.wearableConnections.find((connection) => connection.provider === "GARMIN") ?? null;
  const cpf = user.profile?.cpfEncrypted
    ? decryptSecret(JSON.parse(user.profile.cpfEncrypted) as EncryptedSecret)
    : null;

  // Monta os cards de providers esportivos a partir do catálogo + todas as
  // conexões do usuário (não só Garmin), para o passo wearable multi-provider.
  const connectionSummaries: UserConnectionSummary[] = user.wearableConnections.map((connection) => ({
    provider: connection.provider,
    status: connection.status,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    lastEventAt: connection.lastEventAt?.toISOString() ?? null,
    lastSuccessAt: connection.lastSuccessAt?.toISOString() ?? null,
    lastErrorAt: connection.lastErrorAt?.toISOString() ?? null,
  }));
  const integrationCards = buildIntegrationCards(connectionSummaries);
  const hasConnectedWearable = integrationCards.connected.length > 0;

  const steps = [
    {
      id: "step-1",
      number: "1",
      title: "Conta",
      description: "Nome e e-mail",
      complete: Boolean(user.name && user.email),
      optional: false,
    },
    {
      id: "step-2",
      number: "2",
      title: "Perfil",
      description: "Dados pessoais e CEP",
      complete: Boolean(
        user.profile?.cpfEncrypted &&
          user.profile.phoneE164 &&
          user.profile.heightCm &&
          user.profile.weightKg &&
          user.address?.postalCode &&
          user.address.street &&
          user.address.number &&
          user.address.district &&
          user.address.city &&
          user.address.state &&
          user.address.country,
      ),
      optional: false,
    },
    {
      id: "step-3",
      number: "3",
      title: "Dispositivos",
      description: "Conecte seus treinos",
      // Etapa opcional: conclui com qualquer provider conectado, mas não é
      // exigida para finalizar o onboarding (Req 14.1, 14.3).
      complete: hasConnectedWearable,
      optional: true,
    },
    {
      id: "step-4",
      number: "4",
      title: "WhatsApp",
      description: "Receba seus relatórios",
      complete: Boolean(user.whatsappIdentity?.verifiedAt),
      optional: false,
    },
  ] as const;

  // Direciona primeiro para etapas obrigatórias pendentes; a etapa wearable
  // (opcional) só vira ponto de partida se as demais já estiverem completas.
  const initialStepId =
    steps.find((step) => !step.optional && !step.complete)?.id ??
    steps.find((step) => !step.complete)?.id ??
    steps[steps.length - 1]?.id ??
    "step-1";

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
        nextUrl={nextDestination?.path ?? null}
        nextLabel={nextDestination?.label ?? null}
        user={{
          name: user.name,
          email: user.email,
          image: user.image,
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
        wearableProviders={{
          connected: integrationCards.connected,
          available: integrationCards.available,
        }}
        whatsapp={{
          phone: user.profile?.phoneE164 ?? null,
          verified: Boolean(user.whatsappIdentity?.verifiedAt),
        }}
      />
    </AppShell>
  );
}
