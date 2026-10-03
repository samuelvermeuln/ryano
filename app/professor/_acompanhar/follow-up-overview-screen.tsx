/**
 * SAM-67 — "Acompanhamento" (§19.2): the counters and, for the chosen one,
 * its list — each item opening in the right context (event screen, session,
 * activity). Used by the independent hub and by each school.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { CoachOverviewCounters } from "@/components/follow-ups/coach-overview-counters";
import { PAGE_CLASS, PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { GetCoachFollowUpOverview, OVERVIEW_DEFINITIONS, OVERVIEW_LISTS, type OverviewList } from "@/modules/school/application/coach-follow-up-overview";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export function parseOverviewDays(value: string | undefined) {
  const days = Number(value);
  return [7, 30, 90].includes(days) ? days : 7;
}

export async function FollowUpOverviewScreen({ schoolId, basePath, lista, dias }: { schoolId: string | null; basePath: string; lista?: string; dias?: string }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const days = parseOverviewDays(dias);
  let overview;
  try {
    overview = await new GetCoachFollowUpOverview(prisma).execute(session.user.id, { schoolId, days });
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }
  const selected = OVERVIEW_LISTS.includes(lista as OverviewList) ? (lista as OverviewList) : null;
  return (
    <div className={PAGE_CLASS}>
      <PageHeader title="Acompanhamento" description="Eventos, revisões e sessões que pedem a sua atenção." />
      <CoachOverviewCounters counters={overview.counters} days={days} basePath={basePath} />
      {selected && (
        <SectionCard title={OVERVIEW_DEFINITIONS[selected].label} description={OVERVIEW_DEFINITIONS[selected].definition}>
          {overview.lists[selected].length === 0 ? (
            <EmptyState title="Nada aqui" description="Nenhum item no período escolhido." />
          ) : (
            <ul className="space-y-2" data-testid="overview-list">
              {overview.lists[selected].map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="block rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10" data-testid="overview-item">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="block text-xs text-foreground/60">{item.subtitle}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}
