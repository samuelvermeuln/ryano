/**
 * SAM-66 — the result of a prova as athlete and coach read it: status,
 * official and reported times each with its origin, splits, abandon details,
 * the athlete's perception and goal × result without a success/failure label.
 */
import { formatResultTime, goalVersusResult, RESULT_STATUS_LABELS, type ResultStatus } from "@/modules/school/domain/participation-result";

export type ResultView = {
  status: string;
  officialTimeSeconds: number | null;
  officialTimeSource: string | null;
  reportedTimeSeconds: number | null;
  placement: string | null;
  category: string | null;
  splits: unknown;
  abandonSegment: string | null;
  abandonReason: string | null;
  feedingReport: string | null;
  strategyExecution: string | null;
  dayConditions: string | null;
  officialResultUrl: string | null;
  athletePerception: string | null;
  updatedAt: Date;
  recordedBy: { name: string | null };
};

function Row({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-white/6 py-1.5 text-sm last:border-0" data-testid={testId}>
      <span className="text-foreground/55">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export function ParticipationResultSummary({ result, goalText }: { result: ResultView | null; goalText: string | null }) {
  const comparison = goalVersusResult(goalText, result);
  const splits = Array.isArray(result?.splits) ? (result!.splits as Array<{ label: string; seconds: number; kind: string }>) : [];
  return (
    <div className="space-y-3" data-testid="participation-result">
      {result ? (
        <div>
          <Row label="Situação" value={<span data-testid="result-status" data-status={result.status}>{RESULT_STATUS_LABELS[result.status as ResultStatus] ?? result.status}</span>} />
          {result.officialTimeSeconds !== null && <Row label="Tempo oficial" value={`${formatResultTime(result.officialTimeSeconds)} · ${result.officialTimeSource ?? "origem não informada"}`} testId="result-official" />}
          {result.reportedTimeSeconds !== null && <Row label="Tempo relatado" value={`${formatResultTime(result.reportedTimeSeconds)} · relato do atleta/professor`} testId="result-reported" />}
          {result.placement && <Row label="Classificação" value={result.placement} />}
          {result.category && <Row label="Categoria" value={result.category} />}
          {splits.map((split, index) => <Row key={index} label={split.label} value={formatResultTime(split.seconds)} />)}
          {result.abandonSegment && <Row label="Abandono no segmento" value={result.abandonSegment} testId="result-abandon" />}
          {result.abandonReason && <Row label="Motivo do abandono" value={result.abandonReason} />}
          {result.feedingReport && <Row label="Alimentação" value={result.feedingReport} />}
          {result.strategyExecution && <Row label="Execução da estratégia" value={result.strategyExecution} />}
          {result.dayConditions && <Row label="Condições do dia" value={result.dayConditions} />}
          {result.officialResultUrl && <Row label="Resultado oficial" value={<a href={result.officialResultUrl} target="_blank" rel="noreferrer" className="underline">abrir</a>} />}
          {result.athletePerception && <Row label="Percepção do atleta" value={result.athletePerception} testId="result-perception" />}
          <p className="pt-1 text-[11px] text-foreground/45">Registrado por {result.recordedBy.name ?? "—"} · {result.updatedAt.toLocaleString("pt-BR")}</p>
        </div>
      ) : (
        <p className="text-sm text-foreground/60">Resultado ainda não registrado.</p>
      )}
      <div className="rounded-[14px] border border-white/10 p-3 text-sm" data-testid="goal-vs-result">
        <p><span className="text-foreground/55">Objetivo: </span>{comparison.goal}</p>
        <p><span className="text-foreground/55">Resultado: </span>{comparison.result}</p>
        <p className="mt-1 text-[11px] text-foreground/50">{comparison.note}</p>
      </div>
      <p className="text-[11px] text-foreground/45">As atividades do dia continuam no histórico de treino, mesmo com abandono.</p>
    </div>
  );
}
