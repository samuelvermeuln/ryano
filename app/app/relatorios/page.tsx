import { PreferencesForm } from "@/components/profile/preferences-form";
import { SectionCard } from "@/components/section-card";
import { requireOnboardedUser } from "@/server/auth-guards";

export default async function ReportsPage() {
  const user = await requireOnboardedUser();

  return (
    <SectionCard title="Preferências de relatórios" description="Escolha como você quer receber seus resumos e notificações.">
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
