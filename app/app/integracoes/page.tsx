import { GarminConnectForm } from "@/components/integrations/garmin-connect-form";
import { WhatsAppActivationCard } from "@/components/integrations/whatsapp-activation-card";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { requireOnboardedUser } from "@/server/auth-guards";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requireOnboardedUser();
  const garminConnection = user.wearableConnections.find((connection) => connection.provider === "GARMIN") ?? null;

  return (
    <>
      <SectionCard title="Garmin" description="Primeiro provider da V1, isolado por abstração de wearable provider." action={<StatusBadge tone={garminConnection?.status === "CONNECTED" ? "success" : garminConnection ? "warning" : "neutral"}>{garminConnection?.status ?? "Disponível"}</StatusBadge>}>
        <GarminConnectForm connection={garminConnection ? { status: garminConnection.status, lastSyncAt: garminConnection.lastSyncAt, lastSyncStatus: garminConnection.lastSyncStatus } : null} />
      </SectionCard>

      <SectionCard title="WhatsApp" description="Ativação depende de telefone cadastrado e webhook confiável da Evolution.">
        <WhatsAppActivationCard phone={user.profile?.phoneE164 ?? null} verified={Boolean(user.whatsappIdentity?.verifiedAt)} />
      </SectionCard>

      <SectionCard title="Futuros providers" description="Somente estados honestos. Sem integrações falsas na interface. ">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            "Apple Watch",
            "Polar",
            "Coros",
            "Suunto",
            "Fitbit",
          ].map((provider) => (
            <div key={provider} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
              <p className="font-semibold text-foreground">{provider}</p>
              <p className="mt-2 text-sm text-foreground/60">Em breve</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}
