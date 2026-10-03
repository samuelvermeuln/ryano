/**
 * SAM-76 — the printable evolution report of a preparation (§17.7): period,
 * goals, phases, milestones in objective states, key sessions, comparable
 * history, reviews and conflicts. No readiness percentage anywhere; the
 * milestone count is labelled as administrative completion.
 */
import { formatDistance, formatDuration } from "@/lib/format";
import { GetPreparationReport } from "@/modules/school/application/preparation-report";
import { PREPARATION_STATUS_LABELS } from "@/modules/school/domain/event-preparation";
import { MILESTONE_EVIDENCE_LABELS, type MilestoneEvidenceType } from "@/modules/school/domain/preparation-plan";
import { formatScheduledDateTime } from "@/modules/school/presentation/format";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { prisma } from "@/server/db";
import { PrintButton } from "./print-button";

const fmt = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

export async function PreparationReport({ viewerId, preparationId }: { viewerId: string; preparationId: string }) {
  const report = await new GetPreparationReport(prisma).execute(viewerId, preparationId);
  const tz = report.event.timeZone;
  return (
    <article className="space-y-5 print:text-black" data-testid="preparation-report">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-foreground/50">Relatório de evolução da preparação</p>
          <h1 className="text-xl font-semibold">{report.event.name} · {report.athleteName}</h1>
          <p className="text-sm text-foreground/70" data-testid="report-period">
            Período: {report.period.startedAt ? formatScheduledDateTime(report.period.startedAt, tz) : "—"} → prova em {fmt(report.period.eventLocalDate)}
            {report.period.closedAt ? ` · encerrada em ${formatScheduledDateTime(report.period.closedAt, tz)}` : ""} · acompanhamento: {PREPARATION_STATUS_LABELS[report.status as keyof typeof PREPARATION_STATUS_LABELS] ?? report.status}
          </p>
        </div>
        <PrintButton />
      </header>

      <section className="space-y-1" data-testid="report-goals">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Metas pactuadas</h2>
        {report.goals.length === 0 ? <p className="text-sm text-foreground/60">Nenhum objetivo registrado.</p> : (
          <ul className="space-y-1 text-sm">
            {report.goals.map((pair, index) => (
              <li key={index}>
                {pair.desired && <span className="text-foreground/70">Desejado: {pair.desired.description}. </span>}
                {pair.agreed.map((goal) => <span key={goal.id}>Pactuado: {goal.segment ? `[${goal.segment}] ` : ""}{goal.description}{goal.dueLocalDate ? ` (até ${fmt(goal.dueLocalDate)})` : ""}. </span>)}
              </li>
            ))}
          </ul>
        )}
        {report.formerGoals.length > 0 && <p className="text-xs text-foreground/55">Objetivos que eram deste evento antes da troca de prova-alvo: {report.formerGoals.map((goal) => goal.description).join("; ")}.</p>}
      </section>

      <section className="space-y-1" data-testid="report-milestones">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Marcos</h2>
        <p className="text-sm font-medium" data-testid="report-completion">{report.completion.label}</p>
        {report.phases.length > 0 && <p className="text-xs text-foreground/60">Fases: {report.phases.map((phase) => `${phase.label} (${fmt(phase.startLocalDate)}–${fmt(phase.endLocalDate)})`).join(" · ")}</p>}
        <ul className="space-y-1 text-sm">
          {report.milestones.map((milestone) => (
            <li key={milestone.id} data-testid="report-milestone" data-state={milestone.state}>
              <strong>{milestone.title}</strong> (até {fmt(milestone.dueLocalDate)}) — <span data-testid="report-milestone-state">{milestone.stateLabel}</span>
              <span className="text-foreground/60"> · evidência aceita: {MILESTONE_EVIDENCE_LABELS[milestone.evidenceType as MilestoneEvidenceType] ?? milestone.evidenceType}</span>
              {milestone.evidence.length > 0 && <span className="text-foreground/60"> · evidências: {milestone.evidence.join(", ")}</span>}
              {milestone.review && <span className="text-foreground/70"> · parecer: {milestone.review.observation}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-1" data-testid="report-sessions">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Sessões-chave</h2>
        {report.keySessions.length === 0 ? <p className="text-sm text-foreground/60">Nenhuma sessão ligada a este evento.</p> : (
          <ul className="space-y-1 text-sm">
            {report.keySessions.map((session) => (
              <li key={session.assignmentId} data-testid="report-session">
                {session.title}{session.sportType ? ` (${resolveSportLabel(session.sportType) ?? session.sportType})` : ""}{session.scheduledAt ? ` · ${formatScheduledDateTime(session.scheduledAt, tz)}` : ""}
                {session.executed ? ` · realizada${session.durationSeconds ? ` ${formatDuration(session.durationSeconds)}` : ""}${session.distanceMeters ? ` ${formatDistance(session.distanceMeters)}` : ""}` : " · não realizada"}
                {session.adherencePct !== null ? ` · aderência ${session.adherencePct}% / cobertura ${session.coveragePct ?? "—"}%` : session.complianceScore !== null ? ` · cumprimento ${session.complianceScore}` : ""}
                {session.reviewed ? " · revisada" : session.executed ? " · precisa de revisão" : ""}
                {session.comparable ? ` · histórico: ${session.comparable.comparable ? "comparável" : "comparação limitada"} — ${session.comparable.sentence}` : ""}
                {session.otherEvents.length > 0 ? ` · também em ${session.otherEvents.join(", ")} (carga contada uma vez)` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-foreground/55">Este evento: {report.totals.event.sessions} sessão(ões) · total do aluno (cada sessão uma vez): {report.totals.athlete.sessions}.</p>
      </section>

      <section className="space-y-1" data-testid="report-reviews">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Pareceres do professor</h2>
        {report.reviews.length === 0 ? <p className="text-sm text-foreground/60">Nenhum parecer registrado.</p> : (
          <ul className="space-y-1 text-sm">
            {report.reviews.map((review, index) => <li key={index}>{formatScheduledDateTime(review.updatedAt, tz)}{review.authorName ? ` · ${review.authorName}` : ""}: {review.observation}{review.justification ? ` — ${review.justification}` : ""}</li>)}
          </ul>
        )}
      </section>

      {report.conflicts.length > 0 && (
        <section className="space-y-1" data-testid="report-conflicts">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Outros eventos principais</h2>
          <p className="text-sm">{report.conflicts.map((item) => `${item.name} (${fmt(item.startLocalDate)})`).join(" · ")} — a prioridade entre eles é decisão do professor com o aluno.</p>
        </section>
      )}
      {report.result && <p className="text-xs text-foreground/55">Resultado da prova registrado: ver a aba Resultados.</p>}
      <p className="text-xs text-foreground/50">Estados objetivos a partir de evidências e decisões do professor. Nenhum número aqui mede se o atleta está preparado para a prova.</p>
    </article>
  );
}
