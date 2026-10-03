/**
 * SAM-55 — `/professor/acompanhar/pendencias`: the coach's follow-up tasks
 * (and the school queues they manage), with state, deadline, priority and
 * history (§7.2). Reading a notice never resolves a task here.
 */
import { notFound } from "next/navigation";

import { FollowUpPanel } from "@/components/follow-ups/follow-up-panel";
import { FollowUpPolicyForm } from "@/components/follow-ups/follow-up-policy-form";
import { loadFollowUps } from "@/components/follow-ups/load-follow-ups";
import { GetFollowUpPolicy } from "@/modules/school/application/follow-up-policy";
import { SchoolError } from "@/modules/school/domain/errors";
import { prisma } from "@/server/db";
import { PAGE_CLASS, PageHeader } from "@/components/page-header";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { requireOnboardedSession } from "@/server/auth-guards";

export const dynamic = "force-dynamic";

export default async function PendenciasPage({ searchParams }: { searchParams: Promise<{ dias?: string; status?: string }> }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession({ next: "/professor/acompanhar/pendencias" });
  const data = await loadFollowUps(session.user.id, await searchParams);
  // SAM-56 — the independent coach's own deadlines (a coach without a profile simply has none).
  const policy = await new GetFollowUpPolicy(prisma).execute(session.user.id, { kind: "coach" }).catch((error: unknown) => {
    if (error instanceof SchoolError) return null;
    throw error;
  });
  return (
    <div className={PAGE_CLASS}>
      <PageHeader title="Pendências" description="O que precisa da sua ação nos acompanhamentos — com prazo, prioridade e histórico." />
      <FollowUpPanel basePath="/professor/acompanhar/pendencias" {...data} />
      {policy && <FollowUpPolicyForm initial={policy} schoolId={null} />}
    </div>
  );
}
