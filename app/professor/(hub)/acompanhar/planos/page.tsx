/**
 * TM082 (RF-301/RF-302) — `/professor/acompanhar/planos`: pending invites,
 * athletes who chose this coach (ACTIVE engagements), and adaptations
 * awaiting the athlete's decision. Separate from the coach's own "Estúdio"
 * (`/professor/estudio/**`, Onda 1/TM028) — this page never shows the
 * coach's OWN products, only licenses another athlete invited them to
 * follow.
 *
 * RF-302 discipline: a PENDING invite shows only the product's title/
 * modality (already-public catalog data) and the granted scope — never the
 * athlete's name or any personal data. Only an ACTIVE engagement (accepted)
 * reveals the athlete's name.
 *
 * Convention: lives in the professor `(hub)` route group (SAM-10), inside the
 * standard shell — the shell no longer needs a `schoolId` (SAM-14) — and
 * uses the Ryvano design system (`PageHeader`, `StatTiles`, `SectionCard`,
 * `EmptyState`).
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconCheck, IconClockHour4, IconUsers } from "@tabler/icons-react";

import { EmptyState } from "@/components/empty-state";
import { ITEM_CLASS, PAGE_CLASS, PageHeader, PRIMARY_ACTION_CLASS } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { formatDateTime } from "@/lib/format";
import { acceptCoachInvitationAction } from "./actions";

export const dynamic = "force-dynamic";

function sportLabel(sportType: string | null | undefined): string {
  return resolveSportLabel(sportType) ?? "Modalidade a definir";
}

function scopeLabel(scope: unknown): string {
  if (scope && typeof scope === "object" && "full" in scope && (scope as { full?: unknown }).full === true) {
    return "Plano completo";
  }
  if (scope && typeof scope === "object" && "sportTypes" in scope && Array.isArray((scope as { sportTypes?: unknown[] }).sportTypes)) {
    return (scope as { sportTypes: string[] }).sportTypes.map(sportLabel).join(", ");
  }
  return "Escopo não reconhecido";
}

/** TM082 — data-loading extracted from the page, testable without JSX (same pattern as loadPlanoDetail/TM044). */
export async function loadAcompanharOverview(actorUserId: string) {
  const coach = await prisma.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true, status: true } });
  if (!coach) return null;

  const [pending, active, pendingAdaptations] = await Promise.all([
    prisma.licenseCoachEngagement.findMany({
      where: { coachId: coach.id, status: "PENDING" },
      orderBy: { requestedAt: "desc" },
      select: {
        id: true, requestedAt: true, scope: true,
        license: { select: { id: true, product: { select: { title: true, sportType: true } } } },
      },
    }),
    prisma.licenseCoachEngagement.findMany({
      where: { coachId: coach.id, status: "ACTIVE" },
      orderBy: { acceptedAt: "desc" },
      select: {
        id: true, acceptedAt: true, scope: true,
        license: {
          select: { id: true, product: { select: { title: true, sportType: true } }, athlete: { select: { name: true } } },
        },
      },
    }),
    prisma.planAdaptation.findMany({
      where: { coachId: coach.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, licenseId: true, reason: true, createdAt: true },
    }),
  ]);

  return { coach, pending, active, pendingAdaptations };
}

export default async function AcompanharPlanosPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isMarketplaceEnabled()) notFound();
  const session = await requireOnboardedSession({ next: "/professor/acompanhar/planos" });
  const { error } = await searchParams;

  const overview = await loadAcompanharOverview(session.user.id);
  // Sem CoachProfile → onboarding de professor, não um erro (mesmo padrão de /professor/estudio/produtos).
  if (!overview) redirect("/professor");
  if (overview.coach.status !== "ACTIVE") notFound();

  const { pending, active, pendingAdaptations } = overview;

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Acompanhar planos"
        description="Convites de atletas para acompanhar a instância pessoal do plano deles — separado do seu Estúdio."
      />

      <StatTiles
        items={[
          { label: "Convites pendentes", value: pending.length, tone: pending.length > 0 ? "warning" : "neutral", hint: pending.length > 0 ? "Aguardando você aceitar" : "Nada pendente" },
          { label: "Atletas acompanhados", value: active.length },
          { label: "Ajustes aguardando", value: pendingAdaptations.length, hint: "Decisão do atleta" },
        ]}
      />

      {error && (
        <div className="theme-panel-danger rounded-[20px] border px-4 py-3 text-sm" role="alert">
          {error}
        </div>
      )}

      <SectionCard title={`Convites pendentes (${pending.length})`} description="Ao aceitar, você passa a ver o plano e o nome do atleta.">
        {pending.length === 0 ? (
          <EmptyState title="Nenhum convite pendente no momento" description="Quando um atleta que comprou um plano convidar você para acompanhá-lo, o convite aparece aqui." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {pending.map((invite) => {
              const boundAccept = acceptCoachInvitationAction.bind(null, invite.id);
              return (
                <li key={invite.id} className={`${ITEM_CLASS} space-y-2`}>
                  <p className="inline-flex items-center gap-1.5 font-medium leading-tight">
                    <IconClockHour4 size={16} className="text-amber-400" aria-hidden="true" />
                    {invite.license.product?.title ?? "Plano de treino"}
                  </p>
                  <p className="text-xs text-foreground/60">{sportLabel(invite.license.product?.sportType)} · Escopo: {scopeLabel(invite.scope)}</p>
                  <p className="text-[11px] text-foreground/45">Recebido em {formatDateTime(invite.requestedAt)}</p>
                  <form action={boundAccept}>
                    <button type="submit" className={`${PRIMARY_ACTION_CLASS} mt-1 text-xs`}>
                      <IconCheck size={14} /> Aceitar
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Atletas acompanhados (${active.length})`} description="Abra um acompanhamento para ver o plano do atleta e propor ajustes.">
        {active.length === 0 ? (
          <EmptyState title="Você ainda não acompanha nenhum plano" description="Os atletas aparecem aqui depois que você aceita o convite deles." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((engagement) => (
              <li key={engagement.id}>
                <Link
                  href={`/professor/acompanhar/planos/${engagement.license.id}`}
                  className={`${ITEM_CLASS} block space-y-1.5 transition-colors hover:bg-white/10`}
                >
                  <p className="inline-flex items-center gap-1.5 font-medium leading-tight">
                    <IconUsers size={16} className="text-foreground/55" aria-hidden="true" />
                    {engagement.license.athlete.name ?? "Atleta"}
                  </p>
                  <p className="text-xs text-foreground/60">{engagement.license.product?.title ?? "Plano de treino"}</p>
                  <p className="text-[11px] text-foreground/45">Escopo: {scopeLabel(engagement.scope)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Ajustes aguardando o atleta" description="Propostas de ajuste que você enviou e o atleta ainda não decidiu.">
        {pendingAdaptations.length === 0 ? (
          <EmptyState title="Nenhum ajuste pendente de decisão" description="Quando você propuser um ajuste a um plano acompanhado, ele fica aqui até o atleta aceitar ou recusar." />
        ) : (
          <ul className="space-y-2">
            {pendingAdaptations.map((adaptation) => (
              <li key={adaptation.id} className={`${ITEM_CLASS} flex items-center justify-between gap-3`}>
                <Link href={`/professor/acompanhar/planos/${adaptation.licenseId}`} className="truncate text-sm text-foreground/75 hover:text-foreground">
                  {adaptation.reason}
                </Link>
                <span className="shrink-0 text-[11px] text-foreground/45">{formatDateTime(adaptation.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
