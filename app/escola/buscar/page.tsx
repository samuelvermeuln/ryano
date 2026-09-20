/**
 * T291 — Tela de busca de escola
 * T292 — Solicitação de vínculo (botão "Solicitar entrada")
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolSearchPanel } from "./school-search-panel";

export const dynamic = "force-dynamic";

export default async function BuscarEscolaPage() {
  if (!isSchoolModuleEnabled()) redirect("/app/dashboard");
  await requireOnboardedSession();
  return (
    <main className="min-h-screen p-6 md:p-12 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Encontrar uma escola</h1>
        <p className="text-muted-foreground text-sm mt-1">Busque pelo nome para solicitar seu vínculo.</p>
      </div>
      <SchoolSearchPanel />
      <p className="text-sm text-muted-foreground text-center pt-2">
        Quer criar a sua própria escola?{" "}
        <Link href="/escola/criar" className="text-primary underline underline-offset-2 hover:opacity-80">
          Criar escola
        </Link>
      </p>
    </main>
  );
}
