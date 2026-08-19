import { PublicPageShell } from "@/components/public-page-shell";

export const metadata = {
  title: "Termos",
};

export default function TermsPage() {
  return (
    <PublicPageShell
      eyebrow="Jurídico"
      title="Termos em preparação"
      description="Página provisória para não deixar navegação pública quebrada enquanto base do produto está sendo construída."
    >
      <div className="space-y-4 text-sm leading-7 text-foreground/72">
        <p>
          Os termos definitivos ainda serão redigidos junto com a política operacional da plataforma,
          regras de uso das integrações e fluxo de tratamento de dados.
        </p>
        <p>
          Até a versão funcional completa, este espaço permanece como placeholder honesto e será
          substituído por conteúdo final quando base jurídica e operacional estiver pronta.
        </p>
      </div>
    </PublicPageShell>
  );
}
