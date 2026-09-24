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
 * Convention: same "no AppShell" family as `/professor/estudio/planos`
 * (TM028) — a coach-acompanhante has no `schoolId` context either.
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconCheck, IconClockHour4, IconUsers } from "@tabler/icons-react";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { isRyvanoSportType, getRyvanoSportLabel } from "@/modules/shared/activities/sport-types";
import { formatDateTime } from "@/lib/format";
import { acceptCoachInvitationAction } from "./actions";

export const dynamic = "force-dynamic";

function sportLabel(sportType: string | null | undefined): string {
  if (!sportType) return "Modalidade a definir";
  return isRyvanoSportType(sportType) ? getRyvanoSportLabel(sportType) : sportType;
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
  // Sem CoachProfile → onboarding de professor, não um erro (mesmo padrão de /professor/estudio/planos).
  if (!overview) redirect("/professor");
  if (overview.coach.status !== "ACTIVE") notFound();

  const { pending, active, pendingAdaptations } = overview;

  return (
    <main className="min-h-screen p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Acompanhar planos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Convites de atletas para acompanhar a instância pessoal do plano deles — separado do seu Estúdio.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-bold flex items-center gap-1.5"><IconClockHour4 size={16} /> Convites pendentes</h2>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum convite pendente no momento.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {pending.map((invite) => {
                const boundAccept = acceptCoachInvitationAction.bind(null, invite.id);
                return (
                  <li key={invite.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <p className="font-medium leading-tight">{invite.license.product?.title ?? "Plano de treino"}</p>
                    <p className="text-xs text-muted-foreground">{sportLabel(invite.license.product?.sportType)} · Escopo: {scopeLabel(invite.scope)}</p>
                    <p className="text-[11px] text-foreground/40">Recebido em {formatDateTime(invite.requestedAt)}</p>
                    <form action={boundAccept}>
                      <button
                        type="submit"
                        className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        <IconCheck size={14} /> Aceitar
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold flex items-center gap-1.5"><IconUsers size={16} /> Atletas acompanhados</h2>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">Você ainda não acompanha nenhum plano.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((engagement) => (
                <li key={engagement.id}>
                  <Link
                    href={`/professor/acompanhar/planos/${engagement.license.id}`}
                    className="block rounded-xl border border-border bg-card p-4 hover:bg-muted/40 transition-colors space-y-1.5"
                  >
                    <p className="font-medium leading-tight">{engagement.license.athlete.name ?? "Atleta"}</p>
                    <p className="text-xs text-muted-foreground">{engagement.license.product?.title ?? "Plano de treino"}</p>
                    <p className="text-[11px] text-foreground/40">Escopo: {scopeLabel(engagement.scope)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold">Ajustes aguardando o atleta</h2>
          {pendingAdaptations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum ajuste pendente de decisão.</p>
          ) : (
            <ul className="space-y-2">
              {pendingAdaptations.map((adaptation) => (
                <li key={adaptation.id} className="rounded-xl border border-border bg-card p-3 flex items-center justify-between gap-3">
                  <Link href={`/professor/acompanhar/planos/${adaptation.licenseId}`} className="text-sm text-foreground/70 hover:text-foreground truncate">
                    {adaptation.reason}
                  </Link>
                  <span className="shrink-0 text-[11px] text-foreground/35">{formatDateTime(adaptation.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
