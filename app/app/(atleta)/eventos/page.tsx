/**
 * SAM-57 — `/app/eventos` "Meus eventos" (§6, §19.1, §22.6): the next event
 * and the main event (distinct), days left in the event's zone, desired ×
 * agreed goal, the follow-up state with the responsible's name — or "sem
 * professor responsável" — and "Novo evento" available without a coach.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconCalendarEvent, IconFlag } from "@tabler/icons-react";

import { NewEventDialog } from "@/components/events/new-event-dialog";
import { sportOptions } from "@/components/events/sport-options";
import { EmptyState } from "@/components/empty-state";
import { ITEM_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatTiles } from "@/components/stat-tiles";
import { ListAthleteGoals, type GoalPair } from "@/modules/school/application/athlete-goals";
import { ListAthleteParticipations, type ParticipationView } from "@/modules/school/application/sport-events";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { EVENT_PRIORITY_LABELS, PARTICIPATION_STATUS_LABELS } from "@/modules/school/domain/sport-event";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { buildNoIndexMetadata } from "@/server/seo";

export const metadata = buildNoIndexMetadata({ title: "Meus eventos — Ryvano", description: "Eventos, objetivos e acompanhamento.", path: "/app/eventos" });
export const dynamic = "force-dynamic";

function formatLocal(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

function countdown(item: ParticipationView): string {
  if (item.past) return "Evento realizado";
  if (item.daysUntil === null) return "Data a confirmar";
  if (item.daysUntil === 0) return "É hoje";
  return `Faltam ${item.daysUntil} ${item.daysUntil === 1 ? "dia" : "dias"}`;
}

function priorityOf(item: ParticipationView) {
  return item.agreedPriority ?? item.suggestedPriority;
}

function EventItem({ item, goals }: { item: ParticipationView; goals: GoalPair[] }) {
  const agreed = goals.flatMap((pair) => pair.agreed).find((goal) => goal.participationId === item.id);
  const desired = goals.map((pair) => pair.desired).find((goal) => goal?.participationId === item.id);
  return (
    <li>
      <Link href={`/app/eventos/${item.id}`} className={`${ITEM_CLASS} block space-y-1.5 transition-colors hover:bg-white/10`} data-testid="my-event">
        <p className="inline-flex items-center gap-1.5 font-medium leading-tight">
          <IconCalendarEvent size={16} className="text-rose-300" aria-hidden="true" />
          {item.event.name}
        </p>
        <p className="text-xs text-foreground/60">
          {formatLocal(item.event.startLocalDate)} · {resolveSportLabel(item.event.sportType) ?? item.event.sportType}
          {item.option ? ` · ${item.option.label}` : ""} · {countdown(item)}
        </p>
        <p className="text-xs text-foreground/60">
          {PARTICIPATION_STATUS_LABELS[item.status as keyof typeof PARTICIPATION_STATUS_LABELS] ?? item.status}
          {" · prioridade "}{EVENT_PRIORITY_LABELS[priorityOf(item) as keyof typeof EVENT_PRIORITY_LABELS] ?? priorityOf(item)}
          {item.agreedPriority && item.agreedPriority !== item.suggestedPriority ? " (pactuada)" : ""}
        </p>
        <p className="text-xs">
          <span className="text-foreground/50">Desejado: </span>{desired?.description ?? item.goalText ?? "—"}
          <span className="text-foreground/50"> · Pactuado: </span>{agreed?.description ?? "ainda não pactuado"}
        </p>
        <p className="text-xs font-medium" data-testid="my-event-status">{item.preparation?.statusText ?? "Evento registrado — sem professor responsável"}</p>
        {item.otherMainEvents.length > 0 && <p className="text-[11px] text-amber-300">Outra prova principal próxima: converse com seu professor sobre a prioridade.</p>}
      </Link>
    </li>
  );
}

export default async function MeusEventosPage() {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession({ next: "/app/eventos" });
  const [{ participations }, goals] = await Promise.all([
    new ListAthleteParticipations(prisma).execute(session.user.id, session.user.id),
    new ListAthleteGoals(prisma).execute(session.user.id, session.user.id),
  ]);
  const active = participations.filter((item) => item.status !== "CANCELLED");
  const upcoming = active.filter((item) => !item.past);
  const next = upcoming[0] ?? null;
  const main = upcoming.find((item) => priorityOf(item) === "MAIN") ?? null;
  const past = active.filter((item) => item.past);

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Meus eventos"
        description="Provas, travessias e desafios que você quer fazer — com objetivo e acompanhamento."
        actions={<NewEventDialog sports={sportOptions()} />}
      />

      <StatTiles
        items={[
          { label: "Próximo evento", value: next ? next.event.name : "—", hint: next ? `${formatLocal(next.event.startLocalDate)} · ${countdown(next)}` : "Nenhum evento futuro" },
          { label: "Prova principal", value: main ? main.event.name : "—", hint: main ? `${formatLocal(main.event.startLocalDate)} · ${countdown(main)}` : "Nenhuma marcada como principal" },
          { label: "Eventos futuros", value: upcoming.length },
        ]}
      />

      <SectionCard title={`Próximos (${upcoming.length})`} description="O estado do acompanhamento mostra quem avalia seu evento.">
        {upcoming.length === 0 ? (
          <EmptyState title="Nenhum evento futuro" description="Registre uma prova, travessia ou desafio pessoal — não precisa ter professor." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="my-events">
            {upcoming.map((item) => <EventItem key={item.id} item={item} goals={goals} />)}
          </ul>
        )}
      </SectionCard>

      {past.length > 0 && (
        <SectionCard title={`Realizados (${past.length})`}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {past.map((item) => <EventItem key={item.id} item={item} goals={goals} />)}
          </ul>
        </SectionCard>
      )}

      {main && next && main.id !== next.id && (
        <p className="inline-flex items-center gap-1.5 text-xs text-foreground/55">
          <IconFlag size={14} aria-hidden="true" /> O próximo evento e a prova principal são diferentes.
        </p>
      )}
    </div>
  );
}
