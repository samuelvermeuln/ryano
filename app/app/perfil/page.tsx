import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatWeight } from "@/lib/format";
import { requireOnboardedUser } from "@/server/auth-guards";

export default async function ProfilePage() {
  const user = await requireOnboardedUser();

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <SectionCard title="Dados pessoais" description="Informações principais cadastradas na conta. Alterações estruturais continuam pelo onboarding/perfil."
        action={<StatusBadge tone={user.whatsappIdentity?.verifiedAt ? "success" : "warning"}>{user.whatsappIdentity?.verifiedAt ? "WhatsApp verificado" : "WhatsApp pendente"}</StatusBadge>}
      >
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

      <SectionCard title="Endereço" description="Estrutura mínima prevista para V1.">
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
