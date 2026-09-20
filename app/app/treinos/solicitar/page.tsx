import { notFound } from "next/navigation";

import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { buildNoIndexMetadata } from "@/server/seo";
import { prisma } from "@/server/db";
import { RequestWorkoutForm } from "./request-workout-form";

export const metadata = buildNoIndexMetadata({
  title: "Solicitar treino — Ryvano",
  description: "Peça a um professor da sua escola para te prescrever um treino.",
  path: "/app/treinos/solicitar",
});
export const dynamic = "force-dynamic";

export default async function SolicitarTreinoPage() {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();

  const memberships = await prisma.schoolAthleteMembership.findMany({
    where: { athleteId: session.user.id, status: "ACTIVE" },
    include: { school: { select: { id: true, name: true, status: true } } },
    orderBy: { school: { name: "asc" } },
  });
  const schools = memberships.map((m) => m.school).filter((s) => s.status === "ACTIVE");

  return (
    <div className="max-w-lg mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Solicitar treino ao professor</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Peça a um professor da sua escola para prescrever um treino para você.
        </p>
      </div>
      {schools.length === 0 ? (
        <p className="text-sm text-muted-foreground">Você precisa ser membro ativo de uma escola para solicitar um treino.</p>
      ) : (
        <RequestWorkoutForm schools={schools} />
      )}
    </div>
  );
}
