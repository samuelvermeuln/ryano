/**
 * SAM-11 — Análise do atleta (visão do professor).
 *
 * Weekly volume, consistency, modality distribution, evolution per activity
 * (SAM-44) and adherence over a window chosen in the URL. The body is
 * `AnalysisContent`, shared with the school's athlete sheet; this screen only
 * resolves the coach's scope, the hub shell and the hrefs.
 *
 * Every number is an aggregate of data that already exists — executions,
 * prescriptions and the stored `WorkoutCompliance` scores. There is deliberately
 * no training-load model (CTL/ATL/TSB): that needs per-second streams or a
 * documented TSS-equivalent and the product stores neither, so the gap is stated
 * on the screen instead of filled with a number the coach cannot act on.
 */
import { notFound } from "next/navigation";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetCoachAthleteAnalysis } from "@/modules/school/application/get-coach-athlete-analysis";
import { SchoolError } from "@/modules/school/domain/errors";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AnalysisContent } from "./analysis-content";
import { AthleteHubShell } from "./athlete-hub-shell";
import { athleteHubHref, type CoachAthleteScope } from "./hub-scope";

export type AnalysisSearchParams = { janela?: string; modalidade?: string };

const analysis = new GetCoachAthleteAnalysis(prisma);

function analysisHref(
  scope: CoachAthleteScope,
  athleteId: string,
  options: { windowDays: number; sportType?: string | null },
): string {
  const query = new URLSearchParams();
  if (options.windowDays !== 84) query.set("janela", String(options.windowDays));
  if (options.sportType) query.set("modalidade", options.sportType);
  const suffix = query.toString();
  return `${athleteHubHref(scope, athleteId, "analise")}${suffix ? `?${suffix}` : ""}`;
}

export async function AnalysisScreen({
  scope,
  athleteId,
  query,
}: {
  scope: CoachAthleteScope;
  athleteId: string;
  query: AnalysisSearchParams;
}) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();

  let data: Awaited<ReturnType<typeof analysis.execute>>;
  try {
    data = await analysis.execute(session.user.id, scope, athleteId, {
      ...(query.janela ? { windowDays: query.janela } : {}),
      ...(query.modalidade ? { sportType: query.modalidade } : {}),
    });
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { context } = data;
  const activitiesHref = athleteHubHref(scope, athleteId, "atividades");

  return (
    <AthleteHubShell
      scope={scope}
      athlete={context.athlete}
      teams={context.teams}
      currentCoach={context.currentCoach}
      isResponsibleCoach={context.isResponsibleCoach}
      active="analise"
    >
      <AnalysisContent
        data={data}
        zoneOwner={scope.kind === "school" ? "fuso da escola" : "fuso do atleta"}
        clampedNotice={scope.kind === "school"
          ? "A janela foi encurtada até o início do vínculo atual deste atleta com a escola: dados de uma passagem anterior dependem de autorização do próprio atleta."
          : "A janela foi encurtada até o início do acompanhamento atual com este atleta: dados de um vínculo anterior dependem de autorização do próprio atleta."}
        analysisHref={(options) => analysisHref(scope, athleteId, options)}
        activityBaseHref={activitiesHref}
      />
    </AthleteHubShell>
  );
}
