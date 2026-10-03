/**
 * SAM-57 — `/app/eventos/[participationId]`: event detail with the §19.1
 * tabs — Visão geral, Objetivos, Preparação, Treinos relacionados,
 * Resultados, Histórico. Tabs are links (`?aba=`), so each one is a URL.
 * What does not exist yet says so plainly (no invented data): phases and
 * milestones arrive with SAM-71, linked prescriptions with SAM-59/60 and the
 * result with SAM-66.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";

import { AthleteGoalsPanel } from "@/components/goals/athlete-goals-panel";
import { EmptyState } from "@/components/empty-state";
import { ITEM_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { ListAthleteGoals } from "@/modules/school/application/athlete-goals";
import { GetParticipationDetail } from "@/modules/school/application/participation-detail";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { PREPARATION_STATUS_LABELS } from "@/modules/school/domain/event-preparation";
import { EVENT_PRIORITY_LABELS, PARTICIPATION_STATUS_LABELS, SPORT_EVENT_STATUS_LABELS, SPORT_EVENT_TYPE_LABELS } from "@/modules/school/domain/sport-event";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "visao", label: "Visão geral" },
  { id: "objetivos", label: "Objetivos" },
  { id: "preparacao", label: "Preparação" },
  { id: "treinos", label: "Treinos relacionados" },
  { id: "resultados", label: "Resultados" },
  { id: "historico", label: "Histórico" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const ORIGIN_LABELS: Record<string, string> = { ATHLETE: "registrado por você", COACH: "registrado pelo professor", SCHOOL: "publicado pela escola", SHARED_CATALOG: "catálogo compartilhado" };

function formatLocal(date: string | null) {
  return date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : null;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-white/6 py-1.5 text-sm last:border-0">
      <span className="text-foreground/55">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export default async function EventoDetalhePage({ params, searchParams }: { params: Promise<{ participationId: string }>; searchParams: Promise<{ aba?: string }> }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { participationId } = await params;
  const { aba } = await searchParams;
  const tab: TabId = (TABS.find((item) => item.id === aba)?.id ?? "visao");

  let detail: Awaited<ReturnType<GetParticipationDetail["execute"]>>;
  try {
    detail = await new GetParticipationDetail(prisma).execute(session.user.id, participationId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }
  const { event, participation, option, preparation } = detail;
  const countdown = detail.past ? "Evento realizado" : detail.daysUntil === null ? "Data a confirmar" : `Faltam ${detail.daysUntil} ${detail.daysUntil === 1 ? "dia" : "dias"} (fuso do evento)`;

  let body: React.ReactNode;
  if (tab === "visao") {
    body = (
      <SectionCard title="Visão geral">
        <div data-testid="event-overview">
          <Row label="Data" value={`${formatLocal(event.startLocalDate)}${event.endLocalDate ? ` a ${formatLocal(event.endLocalDate)}` : ""} · ${countdown}`} />
          <Row label="Largada" value={event.startTimeStatus === "CONFIRMED" && event.startAt ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: event.timeZone }).format(event.startAt) + ` (${event.timeZone})` : "a confirmar"} />
          <Row label="Tipo" value={SPORT_EVENT_TYPE_LABELS[event.type as keyof typeof SPORT_EVENT_TYPE_LABELS] ?? event.type} />
          <Row label="Modalidade" value={resolveSportLabel(event.sportType) ?? event.sportType} />
          {option && <Row label="Distância/etapa" value={option.label} />}
          <Row label="Local" value={[event.venue, event.city].filter(Boolean).join(" · ") || "não informado"} />
          {event.organizer && <Row label="Organizador" value={event.organizer} />}
          {event.officialUrl && <Row label="Site oficial" value={<a href={event.officialUrl} className="underline" target="_blank" rel="noreferrer">abrir</a>} />}
          {event.regulationUrl && <Row label="Regulamento" value={<a href={event.regulationUrl} className="underline" target="_blank" rel="noreferrer">abrir{event.regulationConsultedOn ? ` (consultado em ${formatLocal(event.regulationConsultedOn)})` : ""}</a>} />}
          <Row label="Situação do evento" value={SPORT_EVENT_STATUS_LABELS[event.status as keyof typeof SPORT_EVENT_STATUS_LABELS] ?? event.status} />
          <Row label="Origem das informações" value={ORIGIN_LABELS[event.origin] ?? event.origin} />
          <Row label="Acompanhamento" value={<span data-testid="event-follow-up">{preparation?.statusText ?? "Evento registrado — sem professor responsável"}</span>} />
          <Row label="Próximos marcos" value="Sem marcos definidos" />
          <Row label="Última revisão" value={detail.lastRevisionAt ? detail.lastRevisionAt.toLocaleDateString("pt-BR") : "—"} />
        </div>
        {event.conditions.length > 0 && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-foreground/50">Condições</p>
            {event.conditions.map((condition) => <Row key={condition.label} label={condition.label} value={`${condition.value}${condition.provenance ? ` (${condition.provenance})` : ""}`} />)}
          </div>
        )}
        {option && option.segments.length > 0 && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-foreground/50">Segmentos</p>
            {option.segments.map((segment, index) => <Row key={index} label={segment.label} value={segment.value} />)}
          </div>
        )}
      </SectionCard>
    );
  } else if (tab === "objetivos") {
    const pairs = (await new ListAthleteGoals(prisma).execute(session.user.id, session.user.id).catch(() => []))
      .filter((pair) => pair.desired?.participationId === participation.id || pair.agreed.some((goal) => goal.participationId === participation.id));
    body = (
      <SectionCard title="Objetivos" description="O desejado continua visível mesmo quando o professor pactua outro objetivo.">
        <Row label="Objetivo desejado (no cadastro)" value={participation.goalText ?? "—"} />
        <Row label="Prioridade sugerida" value={EVENT_PRIORITY_LABELS[participation.suggestedPriority as keyof typeof EVENT_PRIORITY_LABELS] ?? participation.suggestedPriority} />
        <Row label="Prioridade pactuada" value={participation.agreedPriority ? EVENT_PRIORITY_LABELS[participation.agreedPriority as keyof typeof EVENT_PRIORITY_LABELS] : "ainda não pactuada"} />
        <div className="mt-4"><AthleteGoalsPanel pairs={pairs} /></div>
      </SectionCard>
    );
  } else if (tab === "preparacao") {
    body = (
      <SectionCard title="Preparação">
        <Row label="Estado" value={preparation ? PREPARATION_STATUS_LABELS[preparation.status as keyof typeof PREPARATION_STATUS_LABELS] ?? preparation.status : "—"} />
        <Row label="Responsável" value={preparation?.coachName ?? "sem professor responsável"} />
        {preparation?.firstAnalysisDueLocalDate && <Row label="Primeira análise prevista até" value={formatLocal(preparation.firstAnalysisDueLocalDate)} />}
        <Row label="Disponibilidade até a prova" value={participation.availabilityUntilEvent ?? "—"} />
        <p className="mt-3 text-xs text-foreground/55">Fases e marcos aparecem aqui quando o professor planejar a preparação.</p>
      </SectionCard>
    );
  } else if (tab === "treinos") {
    body = (
      <SectionCard title="Treinos relacionados">
        <EmptyState title="Nenhum treino ligado a este evento ainda" description="Quando o professor publicar treinos para esta preparação, eles aparecem aqui e no seu calendário." />
      </SectionCard>
    );
  } else if (tab === "resultados") {
    body = (
      <SectionCard title="Resultados">
        <EmptyState title={detail.past ? "Resultado ainda não registrado" : "O evento ainda não aconteceu"} description="O resultado oficial e o seu relato ficam guardados aqui depois do evento." />
      </SectionCard>
    );
  } else {
    body = (
      <SectionCard title="Histórico" description="Toda alteração, com autor e data.">
        {detail.history.length === 0 ? (
          <EmptyState title="Sem alterações" description="Quando algo mudar no evento, na participação ou no acompanhamento, fica registrado aqui." />
        ) : (
          <ul className="space-y-2" data-testid="event-history">
            {detail.history.map((entry, index) => (
              <li key={index} className={`${ITEM_CLASS} text-sm`}>
                <p>{entry.summary}</p>
                <p className="text-xs text-foreground/55">{entry.at.toLocaleString("pt-BR")}{entry.actorName ? ` · ${entry.actorName}` : " · sistema"}{entry.reason ? ` · ${entry.reason}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    );
  }

  return (
    <div className={PAGE_CLASS}>
      <Link href="/app/eventos" className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/50 hover:text-foreground/80">
        <IconArrowLeft size={14} aria-hidden="true" /> Meus eventos
      </Link>
      <PageHeader
        title={event.name}
        description={`${formatLocal(event.startLocalDate)} · ${PARTICIPATION_STATUS_LABELS[participation.status as keyof typeof PARTICIPATION_STATUS_LABELS] ?? participation.status} · ${countdown}`}
      />
      <nav className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Seções do evento">
        {TABS.map((item) => (
          <Link
            key={item.id}
            href={`/app/eventos/${participation.id}?aba=${item.id}`}
            role="tab"
            aria-selected={item.id === tab}
            className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium ${item.id === tab ? "border-primary/30 bg-primary/15 text-primary" : "border-white/12 text-foreground/60 hover:bg-white/6"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {body}
    </div>
  );
}
