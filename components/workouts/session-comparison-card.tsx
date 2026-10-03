/**
 * SAM-63 — the five questions of a session, each answered on its own
 * (§17.1); volumes show the formula and the denominator, ">100%" is shown as
 * is and never as "melhor"; what was not measured says so.
 */
import type { SessionComparison, VolumeMetric } from "@/modules/school/presentation/session-comparison";

function Volume({ label, metric, testId }: { label: string; metric: VolumeMetric; testId: string }) {
  return (
    <div data-testid={testId} data-status={metric.status}>
      <dt className="text-xs uppercase tracking-wide text-foreground/50">{label}</dt>
      {metric.status === "compared" ? (
        <dd>
          <span className="text-xl font-semibold tabular-nums">{metric.percent}%</span>
          {metric.aboveTarget && <span className="ml-2 text-xs text-foreground/60">acima do prescrito</span>}
          <p className="text-[11px] text-foreground/55">{metric.formula}</p>
        </dd>
      ) : (
        <dd className="text-sm text-foreground/70">{metric.label}</dd>
      )}
    </div>
  );
}

export function SessionComparisonCard({ comparison }: { comparison: SessionComparison }) {
  const { response } = comparison;
  return (
    <section className="space-y-3 text-sm" data-testid="session-comparison">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">Prescrito × realizado</h2>
      <ol className="space-y-3">
        <li>
          <p className="text-xs font-semibold text-foreground/60">1. Houve atividade?</p>
          <p>{comparison.presence} · {comparison.stateLabel}</p>
        </li>
        <li>
          <p className="text-xs font-semibold text-foreground/60">2. Quanto foi realizado?</p>
          <dl className="mt-1 grid gap-3 sm:grid-cols-2">
            <Volume label="Volume de tempo" metric={comparison.time} testId="volume-time" />
            <Volume label="Volume de distância" metric={comparison.distance} testId="volume-distance" />
          </dl>
          {comparison.otherSport && <p className="mt-1 text-xs text-foreground/60">Atividade de outra modalidade: a substituição é decisão do professor.</p>}
        </li>
        <li>
          <p className="text-xs font-semibold text-foreground/60">3. Como foi executado?</p>
          <p>{comparison.execution.secondary === null ? comparison.execution.label : `${comparison.execution.label}: ${comparison.execution.secondary}/100`}</p>
          <p className="text-[11px] text-foreground/50">Execução por bloco chega na fase 2. FC média parecida não quer dizer estímulo parecido.</p>
        </li>
        <li>
          <p className="text-xs font-semibold text-foreground/60">4. Qual foi a resposta?</p>
          <p>
            RPE {response.rpe === null ? "não informado" : `${response.rpe}/10${response.rpeScale ? ` (${response.rpeScale})` : ""}`}
            {" · "}Dificuldade {response.difficulty === null ? "não informada" : `${response.difficulty}/5`}
            {response.pain ? " · dor/dificuldade relatada" : ""}
          </p>
          {response.comment && <p className="text-xs text-foreground/70">Aluno: {response.comment}</p>}
          {response.coachNote && <p className="text-xs text-foreground/70">Professor: {response.coachNote}</p>}
        </li>
        <li>
          <p className="text-xs font-semibold text-foreground/60">5. Relação com a meta</p>
          <p className="text-foreground/70">{comparison.goal}</p>
        </li>
      </ol>
      {comparison.load && (
        <p className="text-xs text-foreground/70" data-testid="session-load">
          Carga sRPE: {comparison.load.status === "computed" ? comparison.load.formula : comparison.load.label}
          {comparison.load.status === "computed" && <span className="block text-[11px] text-foreground/50">{comparison.load.note}</span>}
        </p>
      )}
    </section>
  );
}
