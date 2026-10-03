/**
 * SAM-68 — `/escola/[schoolId]/acompanhamentos` (§19.3, §20): who answers for
 * which follow-up, events with the school's participants and their goals,
 * open tasks per coach, the queue without a responsible (assign a coach) and
 * collaborators by discipline. Coordination = OWNER/ADMIN; no health data.
 */
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { AssignCoachForm, CollaboratorForm } from "@/components/events/school-follow-up-forms";
import { PAGE_CLASS, PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { GetSchoolFollowUpBoard } from "@/modules/school/application/school-follow-up";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { PREPARATION_STATUS_LABELS } from "@/modules/school/domain/event-preparation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const formatLocal = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

export default async function SchoolFollowUpPage({ params }: { params: Promise<{ schoolId: string }> }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;
  let board;
  try {
    board = await new GetSchoolFollowUpBoard(prisma).execute(session.user.id, schoolId);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }
  const coachOptions = board.coaches.map((coach) => ({ id: coach.coachId, name: coach.name }));

  return (
    <div className={PAGE_CLASS}>
      <PageHeader title="Acompanhamentos" description="Quem responde por cada preparação, eventos com participantes e pendências por professor. Dados de saúde dos alunos não aparecem aqui." />

      <SectionCard title="Distribuição de responsabilidade" description="Preparações abertas por professor e a fila sem responsável.">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm" data-testid="school-distribution">
          {board.distribution.map((row) => (
            <li key={row.coachId} className="rounded-[14px] border border-white/10 p-3" data-testid="school-coach-row">
              <p className="font-medium">{row.name}</p>
              <p className="text-xs text-foreground/60">{row.preparations} acompanhamento(s) · {row.awaitingAnalysis} sem análise · {row.reviewPending} revisão pendente</p>
              <p className="text-xs text-foreground/60">{row.openTasks} pendência(s){row.overdueTasks > 0 ? ` · ${row.overdueTasks} atrasada(s)` : ""}</p>
            </li>
          ))}
          <li className="rounded-[14px] border border-amber-300/30 p-3" data-testid="school-unassigned" data-count={board.unassigned}>
            <p className="font-medium">Sem responsável</p>
            <p className="text-xs text-foreground/60">{board.unassigned} acompanhamento(s) · {board.queueTasks} pendência(s) na fila da escola</p>
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="Eventos com participantes" description="Cada participante com o próprio objetivo e o estado do acompanhamento.">
        {board.events.length === 0 ? (
          <EmptyState title="Nenhum evento aberto" description="Quando alunos da escola registrarem eventos, eles aparecem aqui." />
        ) : (
          <ul className="space-y-4" data-testid="school-events">
            {board.events.map((event) => (
              <li key={event.eventId} data-testid="school-event">
                <p className="text-sm font-medium">{event.name} · {formatLocal(event.date)}</p>
                <ul className="mt-2 space-y-2">
                  {event.participants.map((participant) => (
                    <li key={participant.participationId} className="rounded-[14px] border border-white/10 p-3 text-sm" data-testid="school-participant">
                      <p>{participant.athleteName}{participant.option ? ` · ${participant.option}` : ""}</p>
                      <p className="text-xs text-foreground/60">Objetivo: {participant.goal ?? "não informado"}</p>
                      <p className="text-xs text-foreground/60" data-testid="school-participant-state" data-status={participant.status}>
                        {PREPARATION_STATUS_LABELS[participant.status as keyof typeof PREPARATION_STATUS_LABELS] ?? participant.status}
                        {" · "}Responsável: {participant.responsible ?? "nenhum"}
                      </p>
                      {participant.team.length > 0 && (
                        <p className="text-xs text-foreground/60" data-testid="school-participant-team">
                          Equipe: {participant.team.map((member) => `${member.name}${member.primary ? " (responsável pelo planejamento)" : member.discipline ? ` (colaborador — ${member.discipline})` : " (colaborador)"}`).join(", ")}
                        </p>
                      )}
                      {participant.responsible === null && coachOptions.length > 0 && (
                        <div className="mt-2"><AssignCoachForm preparationId={participant.preparationId} expectedVersion={participant.version} coaches={coachOptions} athleteName={participant.athleteName} /></div>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Colaboradores por disciplina" description="Outro professor da escola acompanha uma disciplina do aluno; o responsável pelo planejamento integrado continua o mesmo e recebe as pendências.">
        {board.athletes.length > 0 && coachOptions.length > 0 ? (
          <CollaboratorForm schoolId={schoolId} athletes={board.athletes.map((athlete) => ({ id: athlete.athleteId, name: athlete.name }))} coaches={coachOptions} />
        ) : (
          <p className="text-sm text-foreground/60">A escola precisa de alunos e professores ativos.</p>
        )}
      </SectionCard>
    </div>
  );
}
