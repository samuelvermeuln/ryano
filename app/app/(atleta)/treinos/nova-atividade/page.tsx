import { notFound } from "next/navigation";

import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { buildNoIndexMetadata } from "@/server/seo";
import { LogUnplannedWorkoutForm } from "./log-unplanned-workout-form";

export const metadata = buildNoIndexMetadata({
  title: "Adicionar atividade — Ryvano",
  description: "Registre uma atividade que você já realizou.",
  path: "/app/treinos/nova-atividade",
});
export const dynamic = "force-dynamic";

export default async function NovaAtividadePage() {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();

  return (
    <div className="max-w-lg mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Adicionar atividade</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registre um treino que você já fez, mesmo sem prescrição.
        </p>
      </div>
      <LogUnplannedWorkoutForm />
    </div>
  );
}
