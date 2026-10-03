/**
 * SAM-53 — desired × agreed goals side by side (§5.4). Read-only; the wish
 * is never hidden by the agreed goal that answered it.
 */
import type { GoalPair, GoalView } from "@/modules/school/application/athlete-goals";

/** SAM-75 — segment of a multisport goal. */
const SEGMENT_LABEL: Record<string, string> = { SWIM: "Natação", T1: "T1", BIKE: "Ciclismo", T2: "T2", RUN: "Corrida" };
import { GOAL_STATUS_LABELS, GOAL_TYPE_LABELS } from "@/modules/school/domain/athlete-goal";

function target(goal: GoalView): string | null {
  const unit = goal.unit ? ` ${goal.unit}` : "";
  if (goal.targetValue !== null) return `Alvo: ${goal.targetValue.toLocaleString("pt-BR")}${unit}`;
  if (goal.targetMin !== null || goal.targetMax !== null) {
    return `Faixa: ${goal.targetMin?.toLocaleString("pt-BR") ?? "…"}–${goal.targetMax?.toLocaleString("pt-BR") ?? "…"}${unit}`;
  }
  return null;
}

function GoalCard({ goal, testId }: { goal: GoalView; testId: string }) {
  const due = goal.dueLocalDate ? goal.dueLocalDate.split("-").reverse().join("/") : null;
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-2 text-sm" data-testid={testId}>
      <p className="text-xs text-foreground/55">
        {GOAL_TYPE_LABELS[goal.type as keyof typeof GOAL_TYPE_LABELS] ?? goal.type}
        {" · "}
        {GOAL_STATUS_LABELS[goal.status as keyof typeof GOAL_STATUS_LABELS] ?? goal.status}
        {goal.needsReview ? " · revisão pendente" : ""}
      </p>
      <p className="font-medium">{goal.segment ? <span className="mr-1 text-xs text-foreground/55">[{SEGMENT_LABEL[goal.segment] ?? goal.segment}]</span> : null}{goal.description}</p>
      {target(goal) && <p className="text-xs text-foreground/70">{target(goal)}</p>}
      {due && <p className="text-xs text-foreground/70">Prazo: {due}</p>}
      {goal.statusReason && <p className="text-xs text-foreground/70">Justificativa: {goal.statusReason}</p>}
      {goal.createdByName && <p className="text-xs text-foreground/45">Registrado por {goal.createdByName}</p>}
      {goal.revisions.length > 0 && (
        <p className="text-xs text-foreground/45" data-testid="goal-revisions">
          {goal.revisions.length} {goal.revisions.length === 1 ? "revisão" : "revisões"}
          {" · última em "}
          {new Date(goal.revisions[0]!.changedAt).toLocaleDateString("pt-BR")}
          {goal.revisions[0]!.changedByName ? ` por ${goal.revisions[0]!.changedByName}` : ""}
        </p>
      )}
    </div>
  );
}

export function AthleteGoalsPanel({ pairs, onlyActive = false }: { pairs: GoalPair[]; onlyActive?: boolean }) {
  const visible = onlyActive
    ? pairs.filter((pair) => pair.desired?.status === "ACTIVE" || pair.agreed.some((goal) => goal.status === "ACTIVE"))
    : pairs;
  if (visible.length === 0) return null;
  return (
    <div data-testid="athlete-goals">
      <p className="text-xs uppercase tracking-wide text-foreground/50">Objetivos</p>
      <ul className="mt-2 grid gap-3">
        {visible.map((pair, index) => (
          <li key={pair.desired?.id ?? pair.agreed[0]?.id ?? index} className="grid gap-2 sm:grid-cols-2" data-testid="goal-pair">
            <div>
              <p className="mb-1 text-xs text-foreground/50">Desejado pelo aluno</p>
              {pair.desired ? <GoalCard goal={pair.desired} testId="goal-desired" /> : <p className="text-xs text-foreground/45">Sem desejo registrado.</p>}
            </div>
            <div>
              <p className="mb-1 text-xs text-foreground/50">Pactuado com o professor</p>
              {pair.agreed.length > 0
                ? pair.agreed.map((goal) => <GoalCard key={goal.id} goal={goal} testId="goal-agreed" />)
                : <p className="text-xs text-foreground/45">Ainda não pactuado.</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
