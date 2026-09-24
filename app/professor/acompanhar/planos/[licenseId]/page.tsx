/**
 * TM083 (RF-303) — `/professor/acompanhar/planos/[licenseId]`: the coach's
 * view of the athlete's PURCHASED INSTANCE — weeks and allowed adjustments.
 *
 * Access gate: requires an ACTIVE `LicenseCoachEngagement` for THIS coach on
 * THIS license — PENDING or ENDED (revoked) resolves to `notFound()`,
 * exactly like a nonexistent license (RNF-001, RF-302).
 *
 * NEVER calls any product-editing use case (`PublishTrainingProductVersion`,
 * `UpdateTrainingProductDraft` — TM025/TM026, the Estúdio's own routes) —
 * the only mutation this page performs is `ProposePlanAdaptation` (TM074),
 * via `./actions.ts`. The purchased `TrainingProductVersion` is read-only
 * here, never edited.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { isRyvanoSportType, getRyvanoSportLabel } from "@/modules/shared/activities/sport-types";
import { formatDateTime } from "@/lib/format";
import { licenseCoachEngagementScopeSchema, scopeIncludesSportType } from "@/modules/school/domain/license-coach-scope";
import { proposeAdaptationAction } from "./actions";

export const dynamic = "force-dynamic";

function sportLabel(sportType: string | null | undefined): string {
  if (!sportType) return "Modalidade a definir";
  return isRyvanoSportType(sportType) ? getRyvanoSportLabel(sportType) : sportType;
}

const weekDateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

/** Monday (UTC calendar date) of the week containing `date` — a display-only grouping key, independent of the athlete's activation timezone math. */
function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** TM083 — data-loading extracted from the page, testable without JSX (same pattern as loadPlanoDetail/TM044). */
export async function loadCoachLicenseView(coachUserId: string, licenseId: string) {
  const coach = await prisma.coachProfile.findUnique({ where: { userId: coachUserId }, select: { id: true, status: true } });
  if (!coach) return null;

  // RF-302 — the ONLY gate: an ACTIVE engagement for THIS coach, on THIS license.
  const engagement = await prisma.licenseCoachEngagement.findFirst({
    where: { licenseId, coachId: coach.id, status: "ACTIVE" },
    select: { id: true, scope: true },
  });
  if (!engagement) return null;

  const license = await prisma.trainingLicense.findUnique({
    where: { id: licenseId },
    select: {
      id: true, status: true,
      product: { select: { title: true, sportType: true, durationWeeks: true } },
      athlete: { select: { name: true } },
    },
  });
  if (!license) return null;

  const [assignments, adaptations] = await Promise.all([
    prisma.workoutAssignment.findMany({
      where: { trainingLicenseId: licenseId },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true, scheduledAt: true, dueAt: true, status: true, adaptationVersion: true,
        workoutTemplateId: true, workoutTemplate: { select: { title: true, sportType: true } },
      },
    }),
    prisma.planAdaptation.findMany({
      where: { licenseId },
      orderBy: { createdAt: "desc" },
      select: { id: true, workoutAssignmentId: true, status: true, reason: true, createdAt: true },
    }),
  ]);

  return { coach, engagement, license, assignments, adaptations };
}

export default async function AcompanharLicenseDetailPage({
  params, searchParams,
}: {
  params: Promise<{ licenseId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isMarketplaceEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { licenseId } = await params;
  const { error } = await searchParams;

  const detail = await loadCoachLicenseView(session.user.id, licenseId);
  if (!detail) notFound();
  const { license, engagement, assignments, adaptations } = detail;

  const scope = licenseCoachEngagementScopeSchema.parse(engagement.scope);
  const adaptationsByAssignment = new Map<string, typeof adaptations>();
  for (const adaptation of adaptations) {
    const list = adaptationsByAssignment.get(adaptation.workoutAssignmentId);
    if (list) list.push(adaptation); else adaptationsByAssignment.set(adaptation.workoutAssignmentId, [adaptation]);
  }

  const weeks = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    if (!assignment.scheduledAt) continue;
    const key = mondayOf(assignment.scheduledAt).toISOString();
    const list = weeks.get(key);
    if (list) list.push(assignment); else weeks.set(key, [assignment]);
  }
  const sortedWeeks = Array.from(weeks.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <main className="min-h-screen p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/professor/acompanhar/planos" className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/50 hover:text-foreground/80 transition-colors">
          <IconArrowLeft size={14} /> Acompanhar planos
        </Link>

        <header>
          <p className="text-xs uppercase tracking-[0.2em] text-foreground/40">Acompanhando</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{license.athlete.name ?? "Atleta"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {license.product?.title ?? "Plano de treino"} · {sportLabel(license.product?.sportType)}
            {license.product?.durationWeeks ? ` · ${license.product.durationWeeks} semanas` : ""}
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {sortedWeeks.length === 0 && (
          <p className="text-sm text-muted-foreground">O calendário deste plano ainda não foi gerado.</p>
        )}

        <div className="space-y-6">
          {sortedWeeks.map(([weekKey, weekAssignments]) => (
            <section key={weekKey} className="space-y-3">
              <h2 className="text-sm font-bold">Semana de {weekDateFormatter.format(new Date(weekKey))}</h2>
              <ul className="space-y-2">
                {weekAssignments.map((assignment) => {
                  const assignmentSportType = assignment.workoutTemplate?.sportType ?? null;
                  const inScope = !assignmentSportType || scopeIncludesSportType(scope, assignmentSportType);
                  const pendingAdaptation = (adaptationsByAssignment.get(assignment.id) ?? []).find((a) => a.status === "PENDING");
                  const boundAction = proposeAdaptationAction.bind(null, licenseId, assignment.id);
                  return (
                    <li key={assignment.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{assignment.workoutTemplate?.title ?? "Sessão do plano"}</p>
                          <p className="text-xs text-muted-foreground">{sportLabel(assignmentSportType)} · {formatDateTime(assignment.scheduledAt)}</p>
                        </div>
                        <span className="shrink-0 text-[11px] text-foreground/40">{assignment.status}</span>
                      </div>

                      {pendingAdaptation && (
                        <p className="text-[11px] text-amber-500">Ajuste proposto aguardando decisão do atleta: {pendingAdaptation.reason}</p>
                      )}

                      {!inScope && (
                        <p className="text-[11px] text-foreground/35">Fora do escopo concedido — sem permissão para ajustar esta sessão.</p>
                      )}

                      {inScope && !pendingAdaptation && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-primary font-medium select-none">Propor ajuste</summary>
                          <form action={boundAction} className="mt-2 space-y-2">
                            <input type="hidden" name="expectedVersion" value={assignment.adaptationVersion} />
                            <div className="space-y-1">
                              <label htmlFor={`scheduledAt-${assignment.id}`} className="text-[11px] font-medium text-foreground/60">Nova data/hora</label>
                              <input
                                id={`scheduledAt-${assignment.id}`}
                                name="scheduledAt"
                                type="datetime-local"
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <label htmlFor={`reason-${assignment.id}`} className="text-[11px] font-medium text-foreground/60">Motivo (obrigatório)</label>
                              <textarea
                                id={`reason-${assignment.id}`}
                                name="reason"
                                required
                                maxLength={1000}
                                rows={2}
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                              />
                            </div>
                            <button
                              type="submit"
                              className="min-h-9 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                            >
                              Enviar proposta
                            </button>
                          </form>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
