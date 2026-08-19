import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { requireOnboardedUser } from "@/server/auth-guards";

export default async function SecurityPage() {
  const user = await requireOnboardedUser();

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <SectionCard title="Segurança da conta" description="Hash de senha, Google OAuth e checagens server-side compõem a base atual da V1." action={<StatusBadge tone={user.passwordHash ? "success" : "warning"}>{user.passwordHash ? "Senha configurada" : "Somente OAuth"}</StatusBadge>}>
        <div className="space-y-4 text-sm leading-7 text-foreground/72">
          <p>Email/senha usam hashing Argon2. Conta Google pode ser vinculada quando provider estiver configurado.</p>
          <p>Autorização administrativa continua validada no servidor; ocultar item de menu não substitui proteção real.</p>
          <p>Alterações de telefone invalidam verificação WhatsApp quando necessário.</p>
        </div>
      </SectionCard>

      <SectionCard title="Alterar senha" description="Para contas já configuradas com senha, a senha atual é exigida antes da troca.">
        <ChangePasswordForm />
      </SectionCard>
    </div>
  );
}
