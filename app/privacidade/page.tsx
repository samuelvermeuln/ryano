import { PublicPageShell } from "@/components/public-page-shell";
import { buildIndexableMetadata } from "@/server/seo";

export const metadata = buildIndexableMetadata({
  title: "Privacidade",
  description: "Compromisso inicial da RYANO com privacidade e uso responsável dos dados.",
  path: "/privacidade",
});

export default function PrivacyPage() {
  return (
    <PublicPageShell
      eyebrow="Privacidade"
      title="Compromisso inicial com uso responsável dos dados"
      description="Texto provisório alinhado ao escopo atual: coletar apenas o necessário, manter finalidade clara e não prometer segurança além do que estiver implementado."
    >
      <div className="space-y-4 text-sm leading-7 text-foreground/72">
        <p>
          A RYANO lidará com identidade, dados de contato, endereço, métricas esportivas e credenciais
          de integrações. O objetivo é minimizar coleta, restringir acesso e deixar finalidade clara.
        </p>
        <p>
          Esta página ainda é provisória. Versão final será publicada junto com autenticação real,
          persistência segura, criptografia de secrets e fluxos completos de atualização/exclusão de dados.
        </p>
      </div>
    </PublicPageShell>
  );
}
