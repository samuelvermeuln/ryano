/**
 * SAM-44 — the athlete's analysis for the school's administration: the same
 * `AnalysisContent` the coach reads, in the school's scope (its prescriptions,
 * its zone), under the athlete's consent for earlier periods.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisContent } from "@/app/professor/_athlete-hub/analysis-content";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetCoachAthleteAnalysis } from "@/modules/school/application/get-coach-athlete-analysis";
import { SchoolError } from "@/modules/school/domain/errors";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ schoolId: string; athleteId: string }>;
  searchParams: Promise<{ janela?: string; modalidade?: string }>;
};

const analysis = new GetCoachAthleteAnalysis(prisma);

function analysisHref(base: string, options: { windowDays: number; sportType?: string | null }): string {
  const query = new URLSearchParams();
  if (options.windowDays !== 84) query.set("janela", String(options.windowDays));
  if (options.sportType) query.set("modalidade", options.sportType);
  const suffix = query.toString();
  return `${base}/analise${suffix ? `?${suffix}` : ""}`;
}

export default async function SchoolAthleteAnalysisPage({ params, searchParams }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, athleteId } = await params;
  const query = await searchParams;
  const base = `/escola/${schoolId}/atletas/${athleteId}`;

  let data: Awaited<ReturnType<typeof analysis.execute>>;
  try {
    data = await analysis.execute(session.user.id, { kind: "school-admin", schoolId }, athleteId, {
      ...(query.janela ? { windowDays: query.janela } : {}),
      ...(query.modalidade ? { sportType: query.modalidade } : {}),
    });
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const athleteName = data.context.athlete.name ?? data.context.athlete.email ?? "Atleta";

  return (
    <div className="space-y-6" data-testid="school-athlete-analysis">
      <div>
        <Link href={base} className="text-xs text-foreground/60 underline-offset-4 hover:underline">← Ficha de {athleteName}</Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Análise de {athleteName}</h1>
        <p className="mt-0.5 text-sm text-foreground/50">Volume, evolução por atividade e aderência no escopo da escola.</p>
      </div>
      <AnalysisContent
        data={data}
        zoneOwner="fuso da escola"
        clampedNotice="A janela foi encurtada até o início do vínculo atual deste atleta com a escola: dados de uma passagem anterior dependem de autorização do próprio atleta."
        analysisHref={(options) => analysisHref(base, options)}
        activityHref={(activityId) => `${base}/atividades/${activityId}`}
      />
    </div>
  );
}
