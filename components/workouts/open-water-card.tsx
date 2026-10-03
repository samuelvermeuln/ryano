/**
 * SAM-65 — the open-water session as both the athlete and the coach see it
 * (AC15): course, environment, conditions with provenance, responsible,
 * support and signals, equipment, cancellation criterion; then what the
 * data can and cannot say (GPS, comparison, technical task).
 */
import {
  CONDITION_PROVENANCE_LABELS, CONDITION_VARIABLE_LABELS, OPEN_WATER_ENVIRONMENT_LABELS, OPEN_WATER_SESSION_KIND_LABELS,
} from "@/modules/school/domain/open-water-session";
import type { OpenWaterView } from "@/modules/school/application/open-water-sessions";
import { formatDuration } from "@/lib/format";

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-foreground/50">{label}</dt>
      <dd className="text-sm">{value || "não informado"}</dd>
    </div>
  );
}

export function OpenWaterCard({ view, audience }: { view: OpenWaterView; audience: "athlete" | "coach" }) {
  const { context } = view;
  const course = context?.course;
  const courseLabel = course
    ? [
      course.layout === "CIRCUIT" ? "Circuito" : course.layout === "POINT_TO_POINT" ? "Ponto a ponto" : null,
      course.laps ? `${course.laps} volta(s)` : null,
      course.direction === "CLOCKWISE" ? "sentido horário" : course.direction === "COUNTERCLOCKWISE" ? "sentido anti-horário" : null,
      course.buoys,
    ].filter(Boolean).join(" · ")
    : null;
  return (
    <section className="space-y-3 text-sm" data-testid="open-water-card">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Águas abertas</h2>
      {context ? (
        <dl className="grid gap-2 sm:grid-cols-2">
          <Row label="Tipo de sessão" value={context.sessionKind ? OPEN_WATER_SESSION_KIND_LABELS[context.sessionKind] : null} />
          <Row label="Ambiente" value={context.environment.kind ? `${OPEN_WATER_ENVIRONMENT_LABELS[context.environment.kind]}${context.environment.water ? ` · água ${context.environment.water === "SALT" ? "salgada" : "doce"}` : ""}` : null} />
          <div data-testid="open-water-course"><Row label="Percurso" value={courseLabel} /></div>
          <Row label="Referência visual" value={course?.visualReference} />
          <Row label="Entrada e saída" value={course?.entryExit} />
          <div data-testid="open-water-responsible"><Row label="Responsável pela sessão" value={context.responsiblePerson} /></div>
          <div data-testid="open-water-support"><Row label="Plano de apoio" value={context.supportPlan} /></div>
          <Row label="Comunicação (sinais)" value={context.communicationSignals} />
          <Row label="Equipamento" value={context.equipment} />
          <Row label="Critério local de cancelamento" value={context.cancellationCriteria} />
          <Row label="Distância" value={context.distance.kind === "ESTIMATED" && context.distance.estimatedMeters ? `estimada em ${(context.distance.estimatedMeters / 1000).toLocaleString("pt-BR")} km` : "sem previsão — a sessão é por tempo"} />
          {context.briefingNotes && <Row label="Briefing (fora do tempo aquático)" value={context.briefingNotes} />}
        </dl>
      ) : (
        <p className="text-xs text-foreground/55">Contexto da sessão não registrado nesta prescrição.</p>
      )}
      {context && context.expectedConditions.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-foreground/50">Condições previstas</p>
          <ul className="text-xs">
            {context.expectedConditions.map((condition, index) => (
              <li key={index}>
                {CONDITION_VARIABLE_LABELS[condition.variable]}: {condition.value} ({CONDITION_PROVENANCE_LABELS[condition.provenance]}{condition.source ? `, ${condition.source}` : ""}{condition.place ? `, ${condition.place}` : ""}{condition.at ? `, ${condition.at}` : ""})
              </li>
            ))}
          </ul>
        </div>
      )}
      {audience === "coach" && view.warnings.length > 0 && (
        <ul className="text-xs text-amber-300" data-testid="open-water-warnings">
          {view.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
      <div className="space-y-1 border-t border-white/10 pt-2" data-testid="open-water-analysis">
        <p>Tempo realizado: {view.realizedDurationSeconds !== null ? formatDuration(view.realizedDurationSeconds) : "sem registro"}</p>
        {view.gps && <p className="text-xs text-foreground/70" data-testid="open-water-gps" data-status={view.gps.status}>{view.gps.label}</p>}
        {view.feedbackLines.length > 0 && (
          <ul className="text-xs" data-testid="open-water-feedback">
            {view.feedbackLines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
        {view.comparison && <p className="text-xs text-foreground/70" data-testid="open-water-comparison">{view.comparison.sentence}</p>}
        {view.technicalTask && <p className="text-xs" data-testid="open-water-task">{view.technicalTask}</p>}
      </div>
    </section>
  );
}
