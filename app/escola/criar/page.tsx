/**
 * Tela de cadastro de nova escola.
 * Cria a escola e redireciona para o painel administrativo.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { CreateSchoolForm } from "./create-school-form";

export const dynamic = "force-dynamic";

export default async function CriarEscolaPage() {
  if (!isSchoolModuleEnabled()) redirect("/app/dashboard");
  await requireOnboardedSession();

  return (
    <main className="min-h-screen p-6 md:p-12">
      <div className="max-w-lg mx-auto space-y-8">
        <div>
          <Link
            href="/escola"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 mb-4"
          >
            ← Minhas escolas
          </Link>
          <h1 className="text-2xl font-semibold">Criar nova escola</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Você será o responsável pela escola e poderá convidar professores e atletas.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <CreateSchoolForm />
        </div>
      </div>
    </main>
  );
}
