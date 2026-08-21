import { PublicPageShell } from "@/components/public-page-shell";
import { buildIndexableMetadata } from "@/server/seo";

export const metadata = buildIndexableMetadata({
  title: "Privacidade",
  description: "Como a ryvano cuida dos seus dados e da sua privacidade.",
  path: "/privacidade",
});

export default function PrivacyPage() {
  return (
    <PublicPageShell
      eyebrow="Privacidade"
      title="Como cuidamos dos seus dados"
      description="Enquanto esta página completa está sendo finalizada, seguimos um princípio simples: coletar apenas o necessário, limitar acessos e deixar claro como cada informação é usada."
    >
      <div className="space-y-4 text-sm leading-7 text-foreground/72">
        <p>
          A ryvano pode tratar dados de identidade, contato, endereço, métricas esportivas e informações
          necessárias para conectar seus serviços. O objetivo é limitar a coleta ao essencial e manter o uso de cada dado o mais claro possível.
        </p>
        <p>
          Esta página ainda está em construção. A versão final será publicada com todos os detalhes sobre armazenamento,
          atualização e exclusão de dados.
        </p>
      </div>
    </PublicPageShell>
  );
}
