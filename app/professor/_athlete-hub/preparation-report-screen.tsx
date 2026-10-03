/**
 * SAM-76 — the preparation's evolution report inside the athlete hub
 * (coach or school), printable. Authorization is the report's own gate.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { PreparationReport } from "@/components/events/preparation-report";
import { SectionCard } from "@/components/section-card";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { ResolveCoachAthleteContext } from "@/modules/school/application/resolve-coach-athlete-context";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell } from "./athlete-hub-shell";
import { athleteHubHref, type CoachAthleteScope } from "./hub-scope";

export async function PreparationReportScreen({ scope, athleteId, participationId }: { scope: CoachAthleteScope; athleteId: string; participationId: string }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  let context;
  try {
    context = await new ResolveCoachAthleteContext(prisma).execute(session.user.id, scope, athleteId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }
  const participation = await prisma.athleteEventParticipation.findUnique({ where: { id: participationId }, select: { athleteId: true, preparation: { select: { id: true } } } });
  if (!participation || participation.athleteId !== athleteId || !participation.preparation) notFound();
  return (
    <AthleteHubShell scope={scope} athlete={context.athlete} teams={context.teams} currentCoach={context.currentCoach} isResponsibleCoach={context.isResponsibleCoach} active="eventos">
      <Link href={`${athleteHubHref(scope, athleteId, "eventos")}/${participationId}`} className="text-xs text-foreground/60 hover:underline print:hidden">← Evento</Link>
      <SectionCard title="Relatório de evolução" description="Estados objetivos: marco atingido, precisa de revisão, faltam evidências, aguardando avaliação. Sem percentual de prontidão.">
        <PreparationReport viewerId={session.user.id} preparationId={participation.preparation.id} />
      </SectionCard>
    </AthleteHubShell>
  );
}