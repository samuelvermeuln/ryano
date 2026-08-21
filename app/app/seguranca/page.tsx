import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { requireOnboardedUser } from "@/server/auth-guards";

export default async function SecurityPage() {
  const user = await requireOnboardedUser();

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <SectionCard title="Segurança da conta" description="Acompanhe como você acessa sua conta e mantenha seus dados protegidos." action={<StatusBadge tone={user.passwordHash ? "success" : "warning"}>{user.passwordHash ? "Senha criada" : "Acesso com Google"}</StatusBadge>}>
        <div className="space-y-4 text-sm leading-7 text-foreground/72">
          <p>Você pode entrar com senha ou com sua conta Google, quando essa opção estiver disponível.</p>
          <p>Se precisar, atualize sua senha a qualquer momento.</p>
          <p>Quando seu telefone muda, a confirmação do WhatsApp pode precisar ser feita novamente.</p>
        </div>
      </SectionCard>

      <SectionCard title="Alterar senha" description="Para sua segurança, confirme sua senha atual antes de escolher uma nova.">
        <ChangePasswordForm />
      </SectionCard>
    </div>
  );
}
