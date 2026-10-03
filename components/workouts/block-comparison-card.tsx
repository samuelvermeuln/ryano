/**
 * SAM-72 — §19.2 "Blocos/voltas" and "Gráficos": prescribed × executed per
 * block and repetition, with adherence and coverage always side by side, the
 * three repetition counts and a readable direction; the chart draws the
 * primary metric with the target bands of each repetition behind it.
 */
import {
  DIRECTION_LABELS, formatMetric, PRIMARY_METRIC_LABELS, type Band, type SessionBlockComparison, type Streams,
} from "@/modules/school/domain/block-comparison";
import { ConfirmRepetitionsForm } from "./confirm-repetitions-form";

const pct = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const bandText = (band: Band) => band.min === band.max ? formatMetric(band.metric, band.min) : `${formatMetric(band.metric, band.min)}–${formatMetric(band.metric, band.max)}`;

export function BlockComparisonCard({ comparison, assignmentId, canConfirm }: { comparison: SessionBlockComparison; assignmentId: string; canConfirm: boolean }) {
  return (
    <section id="blocos" className="space-y-3 rounded-[20px] border border-white/10 bg-white/5 p-4" data-testid="block-comparison">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Blocos e repetições</h2>
        <p className="text-sm" data-testid="main-series">
          Série principal: aderência <strong data-testid="main-adherence">{pct(comparison.main.adherencePct)}</strong>
          {" · "}cobertura <strong data-testid="main-coverage">{pct(comparison.main.coveragePct)}</strong>
        </p>
      </div>
      <p className="text-xs text-foreground/55">Aderência = tempo dentro da faixa ÷ tempo com medição válida. Cobertura = tempo com medição válida ÷ tempo dos blocos avaliáveis. Aquecimento, volta à calma e recuperações ficam fora da série principal.</p>
      {comparison.limitations.map((limitation) => <p key={limitation} className="text-xs text-amber-500" role="note">{limitation}</p>)}
      <ol className="space-y-2">
        {comparison.blocks.map((block) => (
          <li key={block.blockIndex} className="rounded-[14px] border border-white/10 p-3 text-sm" data-testid="comparison-block" data-auxiliary={block.auxiliary}>
            <p className="font-medium">
              {block.title ?? block.blockType}{block.auxiliary ? <span className="text-xs text-foreground/55"> (fora da série principal)</span> : null}
            </p>
            {block.band ? (
              <p className="text-xs text-foreground/60">
                {PRIMARY_METRIC_LABELS[block.band.metric]}: {bandText(block.band)}{block.band.tolerancePct ? ` (tolerância ${block.band.tolerancePct}%)` : ""}
                {block.notMeasured ? " · não medido — fora do cálculo" : ` · aderência ${pct(block.adherencePct)} · cobertura ${pct(block.coveragePct)}`}
              </p>
            ) : <p className="text-xs text-foreground/55">Sem faixa de intensidade prescrita.</p>}
            <p className="text-xs" data-testid="repetition-counts">
              Repetições: prevista {block.repetitions.planned} · identificada {block.repetitions.identified ?? "—"}{block.repetitions.method ? ` (${block.repetitions.method})` : ""} · confirmada {block.repetitions.confirmed ?? "—"}
            </p>
            {block.rows.length > 0 && block.band && (
              <ul className="mt-1 space-y-0.5 text-xs">
                {block.rows.map((row, index) => (
                  <li key={index} data-testid="comparison-repetition" data-direction={row.direction ?? ""}>
                    {row.repetition ? `#${row.repetition}` : "Bloco"}: {row.measured !== null ? formatMetric(block.band!.metric, row.measured) : "sem média"}
                    {row.direction ? ` — ${DIRECTION_LABELS[row.direction]}` : ""}
                    {row.coveragePct !== null ? ` · aderência ${pct(row.adherencePct)} · cobertura ${pct(row.coveragePct)}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {canConfirm && !block.auxiliary && <ConfirmRepetitionsForm assignmentId={assignmentId} blockIndex={block.blockIndex} current={block.repetitions.confirmed} />}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "Gráficos": the primary metric of the main series with each repetition's band behind it. */
export function ComparisonChart({ streams, comparison }: { streams: Streams | null; comparison: SessionBlockComparison }) {
  const band = comparison.blocks.find((block) => !block.auxiliary && block.band)?.band ?? null;
  if (!streams || streams.time.length < 2 || !band) {
    return <section id="graficos" className="rounded-[20px] border border-white/10 bg-white/5 p-4 text-sm text-foreground/60">Gráfico indisponível: sem amostras da atividade ou sem faixa prescrita.</section>;
  }
  const metric = band.metric;
  const values = streams.time.map((_, index) => {
    if (metric === "power") return streams.power?.[index] ?? null;
    if (metric === "heartRate") return streams.heartRate?.[index] ?? null;
    const d0 = streams.distance?.[index];
    const d1 = streams.distance?.[index + 1];
    const t0 = streams.time[index]!;
    const t1 = streams.time[index + 1];
    if (typeof d0 !== "number" || typeof d1 !== "number" || t1 === undefined || d1 <= d0) return null;
    return (t1 - t0) / ((d1 - d0) / (metric === "pace" ? 1000 : 100));
  });
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  const total = streams.time[streams.time.length - 1]!;
  const lo = Math.min(...valid, band.min) * 0.95;
  const hi = Math.max(...valid, band.max) * 1.05;
  const width = 600;
  const height = 160;
  const inverted = metric === "pace" || metric === "swimPace";
  const y = (value: number) => (inverted ? ((value - lo) / (hi - lo)) * height : height - ((value - lo) / (hi - lo)) * height);
  const x = (second: number) => (second / total) * width;
  const bands = comparison.blocks.flatMap((block) => block.auxiliary || !block.band ? [] : block.rows.map((row, index) => ({ block, row, index })));
  let path = "";
  values.forEach((value, index) => {
    if (value === null) return;
    const previousMissing = index === 0 || values[index - 1] === null;
    path += `${previousMissing ? "M" : "L"}${x(streams.time[index]!).toFixed(1)},${y(value).toFixed(1)} `;
  });
  return (
    <section id="graficos" className="space-y-2 rounded-[20px] border border-white/10 bg-white/5 p-4" data-testid="comparison-chart">
      <h2 className="text-sm font-semibold">Gráfico: {PRIMARY_METRIC_LABELS[metric]} com as faixas do alvo</h2>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label={`${PRIMARY_METRIC_LABELS[metric]} ao longo da sessão com as faixas prescritas`}>
        {comparison.aligned && bands.map(({ block, row, index }) => {
          const start = row.startSecond;
          const top = Math.min(y(block.band!.min), y(block.band!.max));
          const bottom = Math.max(y(block.band!.min), y(block.band!.max));
          return <rect key={`${block.blockIndex}-${index}`} x={x(start)} width={Math.max(1, x(start + row.durationSeconds) - x(start))} y={top} height={Math.max(1, bottom - top)} className="fill-primary/20" />;
        })}
        <path d={path} className="fill-none stroke-current" strokeWidth={1.5} />
      </svg>
      <p className="text-xs text-foreground/55">Lacunas de medição aparecem como interrupções da linha, nunca como zero.</p>
    </section>
  );
}
