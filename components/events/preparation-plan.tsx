/**
 * SAM-71 — the preparation's timeline: phases and milestones in date order,
 * sessions tagged with the event (a session shared with another event counts
 * once for the athlete), and goals that pointed at this event before the
 * target changed. The responsible coach edits; everyone else reads.
 */
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { GetPreparationPlan } from "@/modules/school/application/preparation-plan";
import { MILESTONE_EVIDENCE_LABELS, type MilestoneEvidenceType, type MilestoneStatus } from "@/modules/school/domain/preparation-plan";
import { formatScheduledDateTime } from "@/modules/school/presentation/format";
import { prisma } from "@/server/db";
import {
  IllustrativeScheduleModel, LinkSessionForm, MilestoneDecisionForm, MilestoneForm, MilestoneStatusButtons, MoveSessionsForm, PhaseForm, UnlinkSessionButton,
} from "./preparation-plan-forms";

const fmt = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;

function statusTone(status: MilestoneStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "ACHIEVED") return "success";
  if (status === "EVIDENCE_RECEIVED" || status === "IN_REVIEW" || status === "PARTIALLY_ACHIEVED") return "warning";
  if (status === "NOT_ACHIEVED" || status === "CANCELLED") return "danger";
  return "neutral";
}

export async function PreparationPlanSection({ viewerId, preparationId, timeZone }: { viewerId: string; preparationId: string; timeZone: string }) {
  const plan = await new GetPreparationPlan(prisma).execute(viewerId, preparationId).catch(() => null);
  if (!plan) return null;
  const phaseOptions = plan.phases.map((phase) => ({ id: phase.id, label: `${phase.label} (${fmt(phase.startLocalDate)}–${fmt(phase.endLocalDate)})` }));
  const sessionLabel = (session: { title: string; scheduledAt: Date | null }) => `${session.title}${session.scheduledAt ? ` · ${formatScheduledDateTime(session.scheduledAt, timeZone)}` : ""}`;
  const timeline = [
    ...plan.phases.map((phase) => ({ kind: "phase" as const, date: phase.startLocalDate, phase })),
    ...plan.milestones.map((milestone) => ({ kind: "milestone" as const, date: milestone.dueLocalDate, milestone })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-4" data-testid="preparation-plan">
      {timeline.length === 0 ? (
        <EmptyState
          title="Sem fases nem marcos"
          description={plan.editable ? "Organize a preparação do seu jeito: fases podem faltar ou se sobrepor; marcos dizem o que será observado." : "Fases e marcos aparecem aqui quando o professor planejar a preparação."}
        />
      ) : (
        <ol className="space-y-2" data-testid="preparation-timeline">
          {timeline.map((item) => item.kind === "phase" ? (
            <li key={`p-${item.phase.id}`} className="rounded-[16px] border border-white/10 bg-white/5 p-3 text-sm" data-testid="preparation-phase">
              <p className="font-medium">Fase: {item.phase.label} <span className="text-xs text-foreground/55">{fmt(item.phase.startLocalDate)} a {fmt(item.phase.endLocalDate)}</span></p>
              {item.phase.purpose && <p className="text-foreground/75">{item.phase.purpose}</p>}
              {item.phase.protocolNotes && <p className="text-xs text-foreground/60">Protocolo do professor: {item.phase.protocolNotes}</p>}
              {item.phase.revisions.length > 0 && (
                <p className="text-xs text-foreground/50">Versão {item.phase.version} · alterada: {item.phase.revisions.map((revision) => `${formatScheduledDateTime(revision.changedAt, timeZone)} (${revision.reason ?? "sem motivo"})`).join("; ")}</p>
              )}
              {plan.editable && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs">Alterar fase</summary>
                  <div className="mt-2"><PhaseForm preparationId={plan.preparationId} phase={{ ...item.phase }} /></div>
                </details>
              )}
            </li>
          ) : (
            <li key={`m-${item.milestone.id}`} className="rounded-[16px] border border-white/10 bg-white/5 p-3 text-sm" data-testid="preparation-milestone" data-status={item.milestone.status}>
              <p className="flex flex-wrap items-center gap-2 font-medium">
                Marco: {item.milestone.title} <span className="text-xs text-foreground/55">até {fmt(item.milestone.dueLocalDate)}</span>
                <StatusBadge tone={statusTone(item.milestone.status)}>{item.milestone.statusLabel}</StatusBadge>
              </p>
              <p className="text-foreground/75">O que será observado: {item.milestone.criterion}</p>
              <p className="text-xs text-foreground/55">Evidência aceita: {MILESTONE_EVIDENCE_LABELS[item.milestone.evidenceType as MilestoneEvidenceType] ?? item.milestone.evidenceType}</p>
              {item.milestone.sessions.length > 0 && (
                <p className="text-xs text-foreground/60">Sessões de referência: {item.milestone.sessions.map((session) => `${sessionLabel(session)}${session.executed ? " (executada)" : ""}`).join("; ")}</p>
              )}
              {item.milestone.review && <p className="mt-1 text-xs" data-testid="milestone-review">Parecer do professor: {item.milestone.review.observation}</p>}
              {plan.editable && !["ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED", "CANCELLED"].includes(item.milestone.status) && (
                <div className="mt-2 space-y-2">
                  <MilestoneDecisionForm milestoneId={item.milestone.id} />
                  <MilestoneStatusButtons milestoneId={item.milestone.id} status={item.milestone.status} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="space-y-1 text-sm" data-testid="preparation-sessions">
        <p className="text-xs uppercase tracking-wide text-foreground/50">Sessões ligadas a este evento</p>
        {plan.sessions.length === 0 ? <p className="text-foreground/60">Nenhuma sessão ligada.</p> : (
          <>
            <ul className="space-y-1">
              {plan.sessions.map((session) => (
                <li key={session.linkId} data-testid="preparation-session">
                  {sessionLabel(session)}
                  {session.otherEvents.length > 0 && <span className="text-xs text-foreground/55"> · também em: {session.otherEvents.join(", ")}</span>}
                  {session.mainEventConflict && <span className="text-xs text-amber-500"> · ligada a dois eventos principais — decida qual orienta o planejamento</span>}
                  {plan.editable && <> {" "}<UnlinkSessionButton preparationId={plan.preparationId} linkId={session.linkId} /></>}
                </li>
              ))}
            </ul>
            <p className="text-xs text-foreground/60" data-testid="preparation-totals">
              Este evento: {plan.totals.event.sessions} sessão(ões), {minutes(plan.totals.event.seconds)} planejados · Total do aluno (cada sessão uma vez): {plan.totals.athlete.sessions} sessão(ões), {minutes(plan.totals.athlete.seconds)}
              {plan.totals.shared > 0 ? ` · ${plan.totals.shared} compartilhada(s) com outro evento` : ""}
            </p>
          </>
        )}
      </div>

      {plan.formerGoals.length > 0 && (
        <div className="space-y-1 text-sm" data-testid="former-goals">
          <p className="text-xs uppercase tracking-wide text-foreground/50">Objetivos que eram deste evento</p>
          <ul>
            {plan.formerGoals.map((goal) => (
              <li key={`${goal.goalId}-${goal.movedAt.toISOString()}`}>
                {goal.description}{goal.dueLocalDate ? ` (prazo ${fmt(goal.dueLocalDate)})` : ""}
                <span className="text-xs text-foreground/55"> · prova-alvo trocada em {formatScheduledDateTime(goal.movedAt, timeZone)}{goal.movedByName ? ` por ${goal.movedByName}` : ""}{goal.reason ? ` — ${goal.reason}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.editable && (
        <div className="space-y-3 border-t border-white/10 pt-3">
          <details><summary className="cursor-pointer text-sm font-medium">Nova fase</summary><div className="mt-2"><PhaseForm preparationId={plan.preparationId} /></div></details>
          <details><summary className="cursor-pointer text-sm font-medium">Novo marco</summary><div className="mt-2"><MilestoneForm preparationId={plan.preparationId} phases={phaseOptions} /></div></details>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Ligar sessão ao evento</summary>
            <div className="mt-2">
              <LinkSessionForm
                preparationId={plan.preparationId}
                sessions={plan.linkableSessions.map((session) => ({ assignmentId: session.assignmentId, label: sessionLabel(session) }))}
                phases={phaseOptions}
                milestones={plan.milestones.filter((milestone) => !["ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED", "CANCELLED"].includes(milestone.status)).map((milestone) => ({ id: milestone.id, title: milestone.title }))}
              />
            </div>
          </details>
          {plan.sessions.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">Mover bloco de sessões (evento mudou de data)</summary>
              <div className="mt-2"><MoveSessionsForm preparationId={plan.preparationId} sessions={plan.sessions.map((session) => ({ assignmentId: session.assignmentId, label: sessionLabel(session) }))} /></div>
            </details>
          )}
          <details><summary className="cursor-pointer text-sm font-medium">Modelo ilustrativo de 12 semanas (para copiar)</summary><div className="mt-2"><IllustrativeScheduleModel /></div></details>
        </div>
      )}
    </div>
  );
}
