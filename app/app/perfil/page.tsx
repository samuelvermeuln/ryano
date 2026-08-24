import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { PreferencesForm } from "@/components/profile/preferences-form";
import { ProfileDetailsForm } from "@/components/profile/profile-details-form";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatWeight } from "@/lib/format";
import { requireOnboardedUser } from "@/server/auth-guards";
import { decryptSecret, type EncryptedSecret } from "@/server/crypto/secret-vault";

export default async function ProfilePage() {
  const user = await requireOnboardedUser();
  const cpf = user.profile?.cpfEncrypted
    ? decryptSecret(JSON.parse(user.profile.cpfEncrypted) as EncryptedSecret)
    : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <SectionCard
        title="Seu perfil"
        description="Atualize seus dados principais. CPF e telefone ficam bloqueados para sua segurança."
        action={<StatusBadge tone={user.whatsappIdentity?.verifiedAt ? "success" : "warning"}>{user.whatsappIdentity?.verifiedAt ? "WhatsApp verificado" : "WhatsApp pendente"}</StatusBadge>}
      >
        <ProfileDetailsForm
          user={{
            name: user.name,
            email: user.email,
            cpf,
            phone: user.profile?.phoneE164 ?? null,
            heightCm: user.profile?.heightCm ?? null,
            weightKg: user.profile?.weightKg?.toString() ?? null,
            postalCode: user.address?.postalCode ?? null,
            number: user.address?.number ?? null,
            complement: user.address?.complement ?? null,
          }}
        />
      </SectionCard>

      <div className="grid gap-4">
        <SectionCard title="Endereço atual" description="Visualização do endereço preenchido a partir do CEP salvo.">
          <DataList
            rows={[
              ["CEP", user.address?.postalCode ?? "—"],
              ["Logradouro", user.address?.street ?? "—"],
              ["Número", user.address?.number ?? "—"],
              ["Complemento", user.address?.complement ?? "—"],
              ["Bairro", user.address?.district ?? "—"],
              ["Cidade", user.address?.city ?? "—"],
              ["UF", user.address?.state ?? "—"],
              ["País", user.address?.country ?? "—"],
            ]}
          />
        </SectionCard>

        <SectionCard title="Resumo rápido" description="Conferência dos principais dados já salvos na conta.">
          <DataList
            rows={[
              ["Nome", user.name ?? "—"],
              ["Email", user.email],
              ["Telefone", user.profile?.phoneE164 ?? "—"],
              ["Altura", user.profile?.heightCm ? `${user.profile.heightCm} cm` : "—"],
              ["Peso", formatWeight(user.profile?.weightKg?.toString())],
            ]}
          />
        </SectionCard>

        <SectionCard title="Segurança" description="Atualize sua senha da conta.">
          <ChangePasswordForm />
        </SectionCard>
      </div>

      <div id="preferencias" className="xl:col-span-2 scroll-mt-28">
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
      </div>
    </div>
  );
}

function DataList({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid gap-3">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-sm text-foreground/55">{label}</p>
          <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
        </div>
      ))}
    </div>
  );
}
