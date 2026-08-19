import { PreferencesForm } from "@/components/profile/preferences-form";
import { SectionCard } from "@/components/section-card";
import { requireOnboardedUser } from "@/server/auth-guards";

export default async function ReportsPage() {
  const user = await requireOnboardedUser();

  return (
    <SectionCard title="Preferências de relatórios" description="Na V1, interface expõe apenas opções que já possuem base operacional ou estado controlado. Resumos diário e semanal podem permanecer desabilitados no uso real até ativação operacional completa.">
      <PreferencesForm
        preference={user.notificationPreference
          ? {
              postActivityReport: user.notificationPreference.postActivityReport,
              dailySummary: user.notificationPreference.dailySummary,
              weeklySummary: user.notificationPreference.weeklySummary,
              enabled: user.notificationPreference.enabled,
              reportTime: user.notificationPreference.reportTime,
              timezone: user.notificationPreference.timezone,
            }
          : null}
      />
    </SectionCard>
  );
}
