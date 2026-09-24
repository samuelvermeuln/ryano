/**
 * T261 — Tela solicitações pendentes
 * T262 — Ações aprovar/recusar (via Server Actions)
 */
"use server";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { ApproveAthleteMembership } from "@/modules/school/application/approve-athlete-membership";
import { RejectAthleteMembership } from "@/modules/school/application/reject-athlete-membership";
import { ApproveCoachSchoolMembership } from "@/modules/school/application/approve-coach-school-membership";
import { RejectCoachSchoolMembership } from "@/modules/school/application/reject-coach-school-membership";

const approveAthlete = new ApproveAthleteMembership(prisma);
const rejectAthlete = new RejectAthleteMembership(prisma);
const approveCoach = new ApproveCoachSchoolMembership(prisma);
const rejectCoach = new RejectCoachSchoolMembership(prisma);

// ---------------------------------------------------------------------------
// Server Actions (T262)
// ---------------------------------------------------------------------------

async function approveAthleteAction(formData: FormData) {
  "use server";
  const session = await requireOnboardedSession();
  const membershipId = formData.get("membershipId") as string;
  const schoolId = formData.get("schoolId") as string;
  await approveAthlete.execute(session.user.id, schoolId, membershipId);
  revalidatePath("/escola");
}

async function rejectAthleteAction(formData: FormData) {
  "use server";
  const session = await requireOnboardedSession();
  const membershipId = formData.get("membershipId") as string;
  const schoolId = formData.get("schoolId") as string;
  await rejectAthlete.execute(session.user.id, schoolId, membershipId);
  revalidatePath("/escola");
}

async function approveCoachAction(formData: FormData) {
  "use server";
  const session = await requireOnboardedSession();
  const membershipId = formData.get("membershipId") as string;
  const schoolId = formData.get("schoolId") as string;
  await approveCoach.execute(session.user.id, schoolId, membershipId);
  revalidatePath("/escola");
}

async function rejectCoachAction(formData: FormData) {
  "use server";
  const session = await requireOnboardedSession();
  const membershipId = formData.get("membershipId") as string;
  const schoolId = formData.get("schoolId") as string;
  await rejectCoach.execute(session.user.id, schoolId, membershipId);
  revalidatePath("/escola");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function SolicitacoesPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;

  const [pendingAthletes, pendingCoaches] = await Promise.all([
    prisma.schoolAthleteMembership.findMany({
      where: { schoolId, status: "PENDING" },
      include: { athlete: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.coachSchoolMembership.findMany({
      where: { schoolId, status: "PENDING" },
      include: { coach: { include: { user: { select: { name: true, email: true } } } } },
      orderBy: { startedAt: "asc" },
    }),
  ]);

  const total = pendingAthletes.length + pendingCoaches.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Solicitações pendentes</h1>
        {total > 0 && <StatusBadge tone="warning">{String(total)}</StatusBadge>}
      </div>

      {total === 0 && (
        <p className="text-foreground/50">Não há solicitações pendentes.</p>
      )}

      {/* Athlete requests */}
      {pendingAthletes.length > 0 && (
        <SectionCard title={`Atletas (${pendingAthletes.length})`}>
          <ul className="space-y-3">
            {pendingAthletes.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div>
                  <p className="font-medium">{m.athlete.name ?? "—"}</p>
                  <p className="text-xs text-foreground/50">{m.athlete.email}</p>
                </div>
                <div className="flex items-center gap-4">
                  <form action={approveAthleteAction}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <button type="submit" className="text-xs font-semibold text-primary hover:underline">
                      Aprovar
                    </button>
                  </form>
                  <form action={rejectAthleteAction}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <button type="submit" className="text-xs font-semibold text-foreground/50 hover:underline">
                      Recusar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Coach requests */}
      {pendingCoaches.length > 0 && (
        <SectionCard title={`Professores (${pendingCoaches.length})`}>
          <ul className="space-y-3">
            {pendingCoaches.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div>
                  <p className="font-medium">{m.coach.user.name ?? "—"}</p>
                  <p className="text-xs text-foreground/50">{m.coach.user.email}</p>
                </div>
                <div className="flex items-center gap-4">
                  <form action={approveCoachAction}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <button type="submit" className="text-xs font-semibold text-primary hover:underline">
                      Aprovar
                    </button>
                  </form>
                  <form action={rejectCoachAction}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <button type="submit" className="text-xs font-semibold text-foreground/50 hover:underline">
                      Recusar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
