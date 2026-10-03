/** SAM-60 — `/professor/estudio/treinos/[templateId]/atribuir`: batch assignment of the template's current version. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";

import { PAGE_CLASS, PageHeader } from "@/components/page-header";
import { WorkoutCatalog } from "@/modules/school/application/workout-catalog";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { coachAthletes } from "../../catalog-data";
import { BatchAssign } from "./batch-assign";

export const dynamic = "force-dynamic";

export default async function AtribuirModeloPage({ params }: { params: Promise<{ templateId: string }> }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { templateId } = await params;
  let data: Awaited<ReturnType<WorkoutCatalog["get"]>>;
  try {
    data = await new WorkoutCatalog(prisma).get(session.user.id, templateId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }
  if (data.template.status === "ARCHIVED") notFound();
  // An institutional template is assigned inside its own school only.
  const athletes = (await coachAthletes(session.user.id)).filter((athlete) => data.template.ownerType === "COACH" || athlete.schoolId === data.template.schoolId);
  const schoolIds = [...new Set(athletes.map((athlete) => athlete.schoolId).filter((id): id is string => id !== null))];
  const [schools, teams] = await Promise.all([
    prisma.school.findMany({ where: { id: { in: schoolIds } }, select: { id: true, name: true } }),
    prisma.team.findMany({
      where: { schoolId: { in: schoolIds }, archivedAt: null, coaches: { some: { coach: { userId: session.user.id } } } },
      select: { id: true, name: true, schoolId: true },
    }),
  ]);
  return (
    <div className={PAGE_CLASS}>
      <Link href={`/professor/estudio/treinos/${templateId}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/50 hover:text-foreground/80">
        <IconArrowLeft size={14} aria-hidden="true" /> Modelo
      </Link>
      <PageHeader title={`Atribuir: ${data.template.title}`} description={`Versão ${data.version.number}. Alvos relativos são calculados pela ficha de cada aluno e ficam congelados na prescrição.`} />
      <BatchAssign
        athletes={athletes.map((athlete) => ({ athleteId: athlete.athleteId, label: athlete.label, schoolId: athlete.schoolId }))}
        teams={teams}
        schools={schools}
        prescription={{
          title: data.template.title, sportType: data.template.sportType,
          description: data.version.content.instructions ?? data.template.description ?? null,
          blocks: data.version.content.blocks, templateId: data.template.id, templateVersion: data.version.number,
        }}
      />
    </div>
  );
}
