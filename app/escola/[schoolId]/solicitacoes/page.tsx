/**
 * T261 — Tela solicitações pendentes
 * T262 — Ações aprovar/recusar (via Server Actions)
 */
"use server";
import { notFound, revalidatePath } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
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
  await approveAthlete.execute(session.user.id, { membershipId });
  revalidatePath("/escola");
}

async function rejectAthleteAction(formData: FormData) {
  "use server";
  const session = await requireOnboardedSession();
  const membershipId = formData.get("membershipId") as string;
  await rejectAthlete.execute(session.user.id, { membershipId });
  revalidatePath("/escola");
}

async function approveCoachAction(formData: FormData) {
  "use server";
  const session = await requireOnboardedSession();
  const membershipId = formData.get("membershipId") as string;
  await approveCoach.execute(session.user.id, { membershipId });
  revalidatePath("/escola");
}

async function rejectCoachAction(formData: FormData) {
  "use server";
  const session = await requireOnboardedSession();
  const membershipId = formData.get("membershipId") as string;
  await rejectCoach.execute(session.user.id, { membershipId });
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
      include: { user: { select: { name: true, email: true } } },
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
    <div className="p-6 md:p-10 space-y-8">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Solicitações pendentes</h1>
        {total > 0 && (
          <span className="rounded-full bg-primary text-primary-foreground text-xs font-bold px-2.5 py-0.5">{total}</span>
        )}
      </div>

      {total === 0 && (
        <p className="text-muted-foreground">Não há solicitações pendentes.</p>
      )}

      {/* Athlete requests */}
      {pendingAthletes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Atletas ({pendingAthletes.length})
          </h2>
          <ul className="space-y-3">
            {pendingAthletes.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                <div>
                  <p className="font-medium">{m.user.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{m.user.email}</p>
                </div>
                <div className="flex gap-2">
                  <form action={approveAthleteAction}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <button type="submit" className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-medium hover:opacity-90">
                      Aprovar
                    </button>
                  </form>
                  <form action={rejectAthleteAction}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <button type="submit" className="text-xs rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted">
                      Recusar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Coach requests */}
      {pendingCoaches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Professores ({pendingCoaches.length})
          </h2>
          <ul className="space-y-3">
            {pendingCoaches.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                <div>
                  <p className="font-medium">{m.coach.user.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{m.coach.user.email}</p>
                </div>
                <div className="flex gap-2">
                  <form action={approveCoachAction}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <button type="submit" className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-medium hover:opacity-90">
                      Aprovar
                    </button>
                  </form>
                  <form action={rejectCoachAction}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <button type="submit" className="text-xs rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted">
                      Recusar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
