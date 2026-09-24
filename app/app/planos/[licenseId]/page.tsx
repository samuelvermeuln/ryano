/**
 * TM044 (RF-111) — "/app/planos/[licenseId]": Meu plano. Progress, next
 * workout, author, coach follow-up, and adjustments history — TM084 (Onda 3)
 * wires the "Professor acompanhante"/"Histórico de ajustes" cards to real
 * invite/revoke/accept/decline actions — and the "Escolher início"
 * activation flow for a not-yet-activated license.
 *
 * Ownership: the license is only ever looked up scoped to the session's own
 * athleteId — a guessed licenseId belonging to another athlete 404s exactly
 * like a nonexistent one (RNF-001), same discipline as the API routes.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IconArrowLeft, IconCalendarEvent, IconUsers } from "@tabler/icons-react";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { buildNoIndexMetadata } from "@/server/seo";
import { formatDateTime } from "@/lib/format";
import { isRyvanoSportType, getRyvanoSportLabel } from "@/modules/shared/activities/sport-types";
import { deriveLicenseState, type TrainingPlanState } from "@/modules/school/application/list-my-training-licenses";
import { CustomizableCardGrid, type CustomizableCardGridItem, type SavedCardLayoutValue } from "@/components/layout/customizable-card-grid";
import { saveAthletePlanLayoutAction } from "@/app/actions/marketplace-layout";
import { sportEmoji } from "../../treinos/constants";
import { PLAN_STATE_CONFIG } from "../constants";
import { TimezoneField } from "./timezone-field";
import { activateLicenseAction, decideAdaptationAction, inviteCoachAction, revokeCoachEngagementAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ licenseId: string }> }) {
  const { licenseId } = await params;
  return buildNoIndexMetadata({
    title: "Meu plano — Ryvano",
    description: "Detalhe do plano de treino adquirido.",
    path: `/app/planos/${licenseId}`,
  });
}

function sportLabel(sportType: string | null): string {
  if (!sportType) return "Modalidade a definir";
  return isRyvanoSportType(sportType) ? getRyvanoSportLabel(sportType) : sportType;
}

/** Statuses that count as "done" toward progress — MISSED/CANCELLED are terminal but not progress. */
const DONE_ASSIGNMENT_STATUSES = new Set(["COMPLETED", "PARTIALLY_COMPLETED", "JUSTIFIED"]);

/**
 * TM044 — data-loading extracted from the page component so it is testable
 * without rendering JSX (same pattern as `getSchoolOverview` in
 * `app/escola/[schoolId]/page.tsx`). Ownership is enforced in the query
 * itself (`where: { id, athleteId }`) — a licenseId belonging to another
 * athlete resolves to `null`, indistinguishable from a nonexistent one
 * (RNF-001), exactly like the API routes.
 */
export async function loadPlanoDetail(athleteId: string, licenseId: string) {
  const license = await prisma.trainingLicense.findFirst({
    where: { id: licenseId, athleteId },
    select: {
      id: true, productId: true, versionId: true, status: true,
      activationMode: true, activationStatus: true, timezone: true,
      chosenStartLocalDate: true, anchorEventLocalDate: true,
      calendarInstantiated: true, completedAt: true, createdAt: true,
      product: {
        select: {
          id: true, title: true, description: true, sportType: true, durationWeeks: true,
          coach: { select: { displayName: true } },
          school: { select: { name: true } },
        },
      },
    },
  });
  if (!license) return null;

  const [assignmentCounts, nextAssignment, coachEngagement, adaptations] = await Promise.all([
    prisma.workoutAssignment.groupBy({ by: ["status"], where: { trainingLicenseId: license.id }, _count: { _all: true } }),
    prisma.workoutAssignment.findFirst({
      where: { trainingLicenseId: license.id, status: { in: ["SCHEDULED", "AVAILABLE"] }, scheduledAt: { gte: new Date() } },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, scheduledAt: true, workoutTemplate: { select: { title: true, sportType: true } } },
    }),
    prisma.licenseCoachEngagement.findFirst({
      where: { licenseId: license.id, status: "ACTIVE" },
      select: { id: true, coachId: true, coach: { select: { displayName: true } } },
    }),
    prisma.planAdaptation.findMany({
      where: { licenseId: license.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, reason: true, status: true, createdAt: true },
    }),
  ]);

  const total = assignmentCounts.reduce((sum, row) => sum + row._count._all, 0);
  const done = assignmentCounts
    .filter((row) => DONE_ASSIGNMENT_STATUSES.has(row.status))
    .reduce((sum, row) => sum + row._count._all, 0);

  const state = deriveLicenseState(license);
  const author = license.product?.coach?.displayName
    ? { type: "coach" as const, name: license.product.coach.displayName }
    : license.product?.school?.name
      ? { type: "school" as const, name: license.product.school.name }
      : null;

  return { license, assignmentCounts, nextAssignment, coachEngagement, adaptations, total, done, state, author };
}

export default async function PlanoDetailPage({
  params, searchParams,
}: {
  params: Promise<{ licenseId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isMarketplaceEnabled()) redirect("/app/dashboard");

  const session = await requireOnboardedSession();
  const { licenseId } = await params;
  const { error } = await searchParams;

  const [detail, profile] = await Promise.all([
    loadPlanoDetail(session.user.id, licenseId),
    // TM050 (RF-113, design D-09) — own column, never `dashboardLayoutOrder`.
    prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { athletePlanLayoutOrder: true } }),
  ]);
  if (!detail) notFound();
  const { license, nextAssignment, coachEngagement, adaptations, total, done, state, author } = detail;

  const surfaceCards: CustomizableCardGridItem[] = [
    {
      id: "coach-follow-up",
      label: "Professor acompanhante",
      accentClassName: "before:bg-sky-400/60",
      content: <CoachFollowUpContent engagement={coachEngagement} licenseId={license.id} />,
    },
    {
      id: "adjustments",
      label: "Histórico de ajustes",
      accentClassName: "before:bg-amber-400/60",
      content: <AdjustmentsContent adaptations={adaptations} licenseId={license.id} />,
    },
  ];

  return (
    <div className="space-y-6">
      <Link href="/app/planos" className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/50 hover:text-foreground/80 transition-colors">
        <IconArrowLeft size={14} /> Meus planos
      </Link>

      <section className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.12)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="text-4xl leading-none">{sportEmoji(license.product?.sportType ?? "")}</span>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-foreground/40">Meu plano</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">{license.product?.title ?? "Plano de treino"}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-foreground/50">
                <span>{sportLabel(license.product?.sportType ?? null)}</span>
                {license.product?.durationWeeks && (
                  <>
                    <span className="text-foreground/25">·</span>
                    <span>{license.product.durationWeeks} semanas</span>
                  </>
                )}
                {author && (
                  <>
                    <span className="text-foreground/25">·</span>
                    <span>por {author.name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <StatePill state={state} />
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* TM066 (RF-204) — the state pill above already reads "Reembolsado"
          (deriveLicenseState maps TrainingLicenseStatus.REVOKED -> "refunded",
          set by RefundTrainingPurchase/TM065); this banner adds the "efeito
          sobre próximos treinos" this task's criterio asks for. Progress and
          history below are intentionally left unchanged — RF-204 requires
          past executions to remain visible, never removed by a refund. */}
      {state === "refunded" && (
        <div className="theme-panel-neutral rounded-2xl border p-4 text-xs text-foreground/60">
          Este plano foi reembolsado. Seu histórico de treinos já registrados continua disponível abaixo — novas sessões não serão adicionadas ao calendário.
        </div>
      )}

      {license.activationStatus !== "ACTIVATED" ? (
        <ActivationCard licenseId={license.id} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <ProgressCard done={done} total={total} />
          <NextAssignmentCard assignment={nextAssignment} licenseId={license.id} />
        </div>
      )}

      {/* TM050 (RF-113) — "athlete-plan" surface: reorder/resize persisted per (user, surface) via `athletePlanLayoutOrder`, never touching the athlete dashboard's own `dashboardLayoutOrder`. */}
      <CustomizableCardGrid
        items={surfaceCards}
        savedLayout={(Array.isArray(profile?.athletePlanLayoutOrder) ? profile.athletePlanLayoutOrder : undefined) as SavedCardLayoutValue | undefined}
        onSave={saveAthletePlanLayoutAction}
        gridClassName="grid gap-4 md:grid-cols-2"
        maxSpan={2}
      />
    </div>
  );
}

function StatePill({ state }: { state: TrainingPlanState }) {
  const cfg = PLAN_STATE_CONFIG[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shrink-0 ${cfg.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function ActivationCard({ licenseId }: { licenseId: string }) {
  const boundAction = activateLicenseAction.bind(null, licenseId);
  return (
    <section className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-bold">Escolher início</h2>
        <p className="text-xs text-foreground/55 mt-1">
          Seu plano está pronto. Escolha quando começar para gerarmos as sessões no seu calendário.
        </p>
      </div>
      <form action={boundAction} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="mode" className="text-xs font-medium text-foreground/60">Quando começar</label>
          <select
            id="mode"
            name="mode"
            defaultValue="START_NOW"
            className="w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm"
          >
            <option value="START_NOW">Começar agora</option>
            <option value="START_ON_DATE">Escolher data de início</option>
            <option value="TARGET_EVENT_DATE">Treinar para uma data-alvo/prova</option>
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="startLocalDate" className="text-xs font-medium text-foreground/60">
              Data de início <span className="text-foreground/35">(se escolheu &quot;Escolher data de início&quot;)</span>
            </label>
            <input id="startLocalDate" name="startLocalDate" type="date" className="w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="targetEventDate" className="text-xs font-medium text-foreground/60">
              Data da prova/meta <span className="text-foreground/35">(se escolheu &quot;data-alvo/prova&quot;)</span>
            </label>
            <input id="targetEventDate" name="targetEventDate" type="date" className="w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm" />
          </div>
        </div>

        <TimezoneField />

        <button
          type="submit"
          className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Confirmar início
        </button>
      </form>
    </section>
  );
}

function ProgressCard({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 space-y-3">
      <h2 className="text-sm font-bold">Progresso</h2>
      {total === 0 ? (
        <p className="text-xs text-foreground/50">O calendário ainda está sendo preparado.</p>
      ) : (
        <>
          <div className="h-2 rounded-full bg-white/8 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-foreground/55">{done} de {total} sessões concluídas ({pct}%)</p>
        </>
      )}
    </section>
  );
}

function NextAssignmentCard({
  assignment, licenseId,
}: {
  assignment: { id: string; scheduledAt: Date | null; workoutTemplate: { title: string; sportType: string } | null } | null;
  licenseId: string;
}) {
  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 space-y-3">
      <h2 className="text-sm font-bold flex items-center gap-1.5"><IconCalendarEvent size={16} /> Próximo treino</h2>
      {assignment ? (
        <div>
          <p className="text-sm font-medium">{assignment.workoutTemplate?.title ?? "Sessão do plano"}</p>
          <p className="text-xs text-foreground/50 mt-0.5">{formatDateTime(assignment.scheduledAt)}</p>
          <Link href="/app/treinos" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
            Ver no calendário
          </Link>
        </div>
      ) : (
        <p className="text-xs text-foreground/50">Nenhuma sessão futura agendada para este plano.</p>
      )}
      <Link href={`/app/planos/${licenseId}#historico`} className="block text-[11px] text-foreground/35">
        Histórico de ativação e ajustes abaixo
      </Link>
    </section>
  );
}

// TM050 — content-only (no outer <section> chrome): CustomizableCardGrid's
// own <motion.article> already provides the card border/background/padding,
// so wrapping these in a second <section> with the same styling would double
// it up. Same inner markup as before the retrofit, just un-wrapped.
// TM084 — "Permissões de acompanhamento": ACTIVE engagement shows a
// server-side revoke (RF-304 — access ceases on the very next API call, not
// just this button disappearing); no engagement shows the invite form
// (RF-301, explicit scope chosen up front, no biometric grant implied).
function CoachFollowUpContent({
  engagement, licenseId,
}: {
  engagement: { id: string; coachId: string; coach: { displayName: string } } | null;
  licenseId: string;
}) {
  const boundRevoke = engagement ? revokeCoachEngagementAction.bind(null, licenseId, engagement.coachId) : null;
  const boundInvite = inviteCoachAction.bind(null, licenseId);
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold flex items-center gap-1.5"><IconUsers size={16} /> Professor acompanhante</h2>
      {engagement ? (
        <div className="space-y-2">
          <p className="text-xs text-foreground/60">{engagement.coach.displayName} está acompanhando este plano.</p>
          <form action={boundRevoke ?? undefined}>
            <button type="submit" className="text-[11px] font-semibold text-destructive hover:underline">
              Revogar acesso
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-foreground/50">
            Nenhum professor está acompanhando este plano. Comprar não contrata acompanhamento — o convite é uma ação separada.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-primary font-medium select-none">Convidar professor acompanhante</summary>
            <form action={boundInvite} className="mt-2 space-y-2">
              <div className="space-y-1">
                <label htmlFor="coachId" className="text-[11px] font-medium text-foreground/60">ID do professor</label>
                <input id="coachId" name="coachId" required className="w-full rounded-lg border border-white/12 bg-white/5 px-2.5 py-1.5 text-xs" />
              </div>
              <div className="space-y-1">
                <label htmlFor="scopeMode" className="text-[11px] font-medium text-foreground/60">Escopo</label>
                <select id="scopeMode" name="scopeMode" defaultValue="full" className="w-full rounded-lg border border-white/12 bg-white/5 px-2.5 py-1.5 text-xs">
                  <option value="full">Plano completo</option>
                  <option value="partial">Só algumas modalidades</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="sportTypes" className="text-[11px] font-medium text-foreground/60">
                  Modalidades <span className="text-foreground/35">(separadas por vírgula — só se escopo parcial)</span>
                </label>
                <input id="sportTypes" name="sportTypes" placeholder="run, swim" className="w-full rounded-lg border border-white/12 bg-white/5 px-2.5 py-1.5 text-xs" />
              </div>
              <button type="submit" className="min-h-9 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                Enviar convite
              </button>
            </form>
          </details>
        </div>
      )}
    </div>
  );
}

function AdjustmentsContent({
  adaptations, licenseId,
}: {
  adaptations: Array<{ id: string; reason: string; status: string; createdAt: Date }>;
  licenseId: string;
}) {
  return (
    <div id="historico" className="space-y-2">
      <h2 className="text-sm font-bold">Histórico de ajustes</h2>
      {adaptations.length === 0 ? (
        <p className="text-xs text-foreground/50">Nenhum ajuste registrado até agora.</p>
      ) : (
        <ul className="space-y-2">
          {adaptations.map((adaptation) => {
            const boundAccept = decideAdaptationAction.bind(null, licenseId, adaptation.id, "ACCEPT");
            const boundDecline = decideAdaptationAction.bind(null, licenseId, adaptation.id, "DECLINE");
            return (
              <li key={adaptation.id} className="text-xs text-foreground/60 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{adaptation.reason}</span>
                  <span className="shrink-0 text-foreground/35">{formatDateTime(adaptation.createdAt)}</span>
                </div>
                {adaptation.status === "PENDING" ? (
                  <div className="flex items-center gap-3">
                    <form action={boundAccept}>
                      <button type="submit" className="text-[11px] font-semibold text-primary hover:underline">Aceitar</button>
                    </form>
                    <form action={boundDecline}>
                      <button type="submit" className="text-[11px] font-semibold text-foreground/50 hover:underline">Recusar</button>
                    </form>
                  </div>
                ) : (
                  <span className="text-[11px] text-foreground/35">{adaptation.status === "ACCEPTED" ? "Aceito" : "Recusado"}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
