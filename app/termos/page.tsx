import { PublicPageShell } from "@/components/public-page-shell";
import { buildIndexableMetadata } from "@/server/seo";

export const metadata = buildIndexableMetadata({
  title: "Termos",
  description: "Informações sobre os termos de uso da ryvano.",
  path: "/termos",
});

export default function TermsPage() {
  return (
    <PublicPageShell
      eyebrow="Jurídico"
      title="Termos em preparação"
      description="Estamos finalizando esta página para explicar de forma clara como funciona o uso da ryvano."
    >
      <div className="space-y-4 text-sm leading-7 text-foreground/72">
        <p>
          Os termos definitivos ainda estão sendo preparados e vão reunir as regras de uso da plataforma,
          das integrações e do tratamento de dados.
        </p>
        <p>
          Até lá, este espaço permanece temporário e será substituído assim que o conteúdo final estiver pronto.
        </p>
      </div>
    </PublicPageShell>
  );
}
