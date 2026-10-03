/**
 * SAM-55 — `/escola/[schoolId]/pendencias`: the school's coordination queue
 * (events without a responsible, …) and the tasks this manager took, scoped
 * to this school. OWNER/ADMIN only.
 */
import { notFound } from "next/navigation";

import { FollowUpPanel } from "@/components/follow-ups/follow-up-panel";
import { FollowUpPolicyForm } from "@/components/follow-ups/follow-up-policy-form";
import { loadFollowUps } from "@/components/follow-ups/load-follow-ups";
import { GetFollowUpPolicy } from "@/modules/school/application/follow-up-policy";
import { CanManageSchool } from "@/modules/school/application/can-manage-school";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolMembershipRepository } from "@/modules/school/infrastructure/school-membership-repository";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }>; searchParams: Promise<{ dias?: string; status?: string }> };

export default async function EscolaPendenciasPage({ params, searchParams }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;
  if (!await new CanManageSchool(new SchoolMembershipRepository(prisma)).execute(session.user.id, schoolId)) notFound();
  const data = await loadFollowUps(session.user.id, await searchParams, (task) => task.schoolId === schoolId);
  const policy = await new GetFollowUpPolicy(prisma).execute(session.user.id, { kind: "school", schoolId });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Pendências da escola</h1>
        <p className="mt-1 text-sm text-foreground/60">Acompanhamentos sem professor responsável e o que a coordenação assumiu.</p>
      </div>
      <FollowUpPanel basePath={`/escola/${schoolId}/pendencias`} {...data} />
      <FollowUpPolicyForm initial={policy} schoolId={schoolId} />
    </div>
  );
}
