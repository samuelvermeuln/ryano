/**
 * SAM-66 — the athlete's events as the coach sees them in the hub: each prova
 * with date, follow-up state and result, opening the event screen where the
 * result, the post-event review and closing live. (SAM-67 extends this into
 * the full follow-up screen.)
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { ResolveCoachAthleteContext } from "@/modules/school/application/resolve-coach-athlete-context";
import { ListAthleteParticipations } from "@/modules/school/application/sport-events";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { RESULT_STATUS_LABELS, type ResultStatus } from "@/modules/school/domain/participation-result";
import { PARTICIPATION_STATUS_LABELS } from "@/modules/school/domain/sport-event";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AthleteHubShell } from "./athlete-hub-shell";
import { athleteHubHref, type CoachAthleteScope } from "./hub-scope";

const formatLocal = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

export async function EventsScreen({ scope, athleteId }: { scope: CoachAthleteScope; athleteId: string }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  let context;
  let list;
  try {
    context = await new ResolveCoachAthleteContext(prisma).execute(session.user.id, scope, athleteId);
    list = await new ListAthleteParticipations(prisma).execute(session.user.id, athleteId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }
  const results = await prisma.participationResult.findMany({ where: { participationId: { in: list.participations.map((item) => item.id) } }, select: { participationId: true, status: true } });
  const base = athleteHubHref(scope, athleteId, "eventos");

  return (
    <AthleteHubShell scope={scope} athlete={context.athlete} teams={context.teams} currentCoach={context.currentCoach} isResponsibleCoach={context.isResponsibleCoach} active="eventos">
      <SectionCard title="Eventos do aluno" description="Cada prova com data, acompanhamento e resultado.">
        {list.participations.length === 0 ? (
          <EmptyState title="Nenhum evento registrado" description="Quando o aluno cadastrar um evento, ele aparece aqui." />
        ) : (
          <ul className="space-y-2" data-testid="coach-athlete-events">
            {list.participations.map((item) => {
              const result = results.find((row) => row.participationId === item.id);
              return (
                <li key={item.id}>
                  <Link href={`${base}/${item.id}`} className="flex flex-col gap-1 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10" aria-label={`Abrir evento ${item.event.name}`}>
                    <span className="text-sm font-medium">{item.event.name}{item.option ? ` · ${item.option.label}` : ""}</span>
                    <span className="text-xs text-foreground/60">
                      {formatLocal(item.event.startLocalDate)} · {PARTICIPATION_STATUS_LABELS[item.status as keyof typeof PARTICIPATION_STATUS_LABELS] ?? item.status}
                      {item.preparation ? ` · ${item.preparation.statusText}` : ""}
                      {result ? ` · ${RESULT_STATUS_LABELS[result.status as ResultStatus] ?? result.status}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </AthleteHubShell>
  );
}
