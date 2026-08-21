import { GarminConnectForm } from "@/components/integrations/garmin-connect-form";
import { WhatsAppActivationCard } from "@/components/integrations/whatsapp-activation-card";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { requireOnboardedUser } from "@/server/auth-guards";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requireOnboardedUser();
  const garminConnection = user.wearableConnections.find((connection) => connection.provider === "GARMIN") ?? null;
  const garminConnected = garminConnection?.status === "CONNECTED";

  return (
    <>
      <SectionCard
        title="Garmin"
        description="Conecte sua conta para trazer seus treinos automaticamente."
        action={
          <StatusBadge tone={garminConnected ? "success" : garminConnection ? "warning" : "neutral"}>
            {garminConnected ? "Garmin conectado" : "Garmin não conectado"}
          </StatusBadge>
        }
      >
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
      </SectionCard>

      <SectionCard title="WhatsApp" description="Confirme seu número para receber seus resumos no WhatsApp.">
        <WhatsAppActivationCard phone={user.profile?.phoneE164 ?? null} verified={Boolean(user.whatsappIdentity?.verifiedAt)} />
      </SectionCard>

      <SectionCard title="Em breve" description="Novas conexões serão adicionadas aqui.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {["Apple Watch", "Polar", "Coros", "Suunto", "Fitbit"].map((provider) => (
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
