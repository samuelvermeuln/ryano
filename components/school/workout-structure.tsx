/**
 * Prescription rendering shared by the school's administration sheet and the
 * coach's athlete hub: the block structure, the prescribed-vs-executed table and
 * the compliance breakdown.
 *
 * Extracted from `app/escola/[schoolId]/atletas/[athleteId]/athlete-training-panel.tsx`
 * — which now consumes it — instead of writing a second renderer for the coach's
 * screens. A workout's structure does not depend on who is reading it, and two
 * copies is how "Prescrito × Realizado" ends up computing adherence differently
 * on two screens.
 *
 * Server Component friendly: no hooks, no state. Dates arrive pre-formatted as
 * strings because these render on both sides and formatting a timestamp with the
 * browser's time zone would not match the server-rendered HTML.
 */
import { formatDistance, formatDuration, formatHeartRate, formatPower } from "@/lib/format";
import { BLOCK_TYPE_EMOJI, BLOCK_TYPE_LABEL } from "@/modules/school/presentation/workout-blocks";
import { COMPLIANCE_DIMENSION_LABELS } from "@/modules/school/presentation/workout-labels";

export type WorkoutStructureBlock = {
  id: string;
  blockType: string;
  title: string | null;
  durationS: number | null;
  distanceM: number | null;
  repetitions: number | null;
  targets: string[];
  restTargets: string[];
};

export type WorkoutExecutionSummary = {
  source: string;
  startedLabel: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  averageHeartRate: number | null;
  averagePower: number | null;
  complianceScore: number | null;
};

/** Compliance is stored 0–100 and read as x/10 everywhere in the product. */
export function formatComplianceScore(score: number): string {
  return `${(score / 10).toFixed(1)}/10`;
}

export function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/50">{children}</h3>;
}

export function WorkoutBlockList({ blocks }: { blocks: WorkoutStructureBlock[] }) {
  return (
    <ol className="space-y-2">
      {blocks.map((block, index) => (
        <li key={block.id} className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-base leading-none">
              {BLOCK_TYPE_EMOJI[block.blockType] ?? "▶"}
            </span>
            <span className="text-xs font-semibold text-foreground/80">
              {block.repetitions && block.repetitions > 1 ? `${block.repetitions}× ` : ""}
              {block.title ?? BLOCK_TYPE_LABEL[block.blockType] ?? block.blockType}
            </span>
            <span className="ml-auto text-xs text-foreground/40">#{index + 1}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-foreground/60">
            {block.durationS != null && <span>⏱ {formatDuration(block.durationS)}</span>}
            {block.distanceM != null && <span>📏 {formatDistance(block.distanceM)}</span>}
          </div>
          {block.targets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {block.targets.map((target) => (
                <span key={target} className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {target}
                </span>
              ))}
            </div>
          )}
          {block.restTargets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-foreground/40">Descanso:</span>
              {block.restTargets.map((target) => (
                <span key={target} className="rounded-lg bg-white/10 px-2 py-0.5 text-xs text-foreground/60">
                  {target}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * Explains an absent structure rather than rendering an empty list: a plan
 * session that was never instantiated is a different thing from a workout with
 * no blocks, and the coach needs to tell them apart.
 */
export function WorkoutStructureSection({
  blocks,
  sourceLabel,
}: {
  blocks: WorkoutStructureBlock[] | null;
  sourceLabel: string | null;
}) {
  return (
    <section className="space-y-2">
      <SectionTitle>Estrutura do treino</SectionTitle>
      {blocks && blocks.length > 0 ? (
        <WorkoutBlockList blocks={blocks} />
      ) : (
        <p className="text-sm text-foreground/50">
          {sourceLabel
            ? `Sessão do plano “${sourceLabel}”. A estrutura detalhada ainda não foi criada para este treino.`
            : "Este treino não tem estrutura detalhada."}
        </p>
      )}
    </section>
  );
}

/**
 * Rows appear only when at least one side has a value, so the table never
 * suggests a dimension was prescribed when it was not. Heart rate and power show
 * a dash on the prescribed side because the block-level targets are ranges shown
 * in the structure above, not a single comparable number.
 */
export function PrescribedVsExecuted({
  targetDurationSeconds,
  targetDistanceMeters,
  execution,
}: {
  targetDurationSeconds: number | null;
  targetDistanceMeters: number | null;
  execution: WorkoutExecutionSummary;
}) {
  return (
    <section className="space-y-2">
      <SectionTitle>Prescrito × Realizado</SectionTitle>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-xs text-foreground/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Dimensão</th>
              <th className="px-4 py-2 text-right font-medium">Prescrito</th>
              <th className="px-4 py-2 text-right font-medium">Realizado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {(targetDistanceMeters != null || execution.distanceMeters != null) && (
              <tr>
                <td className="px-4 py-2 text-foreground/70">Distância</td>
                <td className="px-4 py-2 text-right text-foreground/70">
                  {targetDistanceMeters != null ? formatDistance(targetDistanceMeters) : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {execution.distanceMeters != null ? formatDistance(execution.distanceMeters) : "—"}
                </td>
              </tr>
            )}
            {(targetDurationSeconds != null || execution.durationSeconds != null) && (
              <tr>
                <td className="px-4 py-2 text-foreground/70">Duração</td>
                <td className="px-4 py-2 text-right text-foreground/70">
                  {targetDurationSeconds != null ? formatDuration(targetDurationSeconds) : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {execution.durationSeconds != null ? formatDuration(execution.durationSeconds) : "—"}
                </td>
              </tr>
            )}
            {execution.averageHeartRate != null && (
              <tr>
                <td className="px-4 py-2 text-foreground/70">FC média</td>
                <td className="px-4 py-2 text-right text-foreground/70">—</td>
                <td className="px-4 py-2 text-right">{formatHeartRate(execution.averageHeartRate)}</td>
              </tr>
            )}
            {execution.averagePower != null && (
              <tr>
                <td className="px-4 py-2 text-foreground/70">Potência média</td>
                <td className="px-4 py-2 text-right text-foreground/70">—</td>
                <td className="px-4 py-2 text-right">{formatPower(execution.averagePower)}</td>
              </tr>
            )}
            <tr>
              <td className="px-4 py-2 text-foreground/70">Aderência</td>
              <td className="px-4 py-2 text-right text-foreground/70">—</td>
              <td className="px-4 py-2 text-right">
                {execution.complianceScore != null ? formatComplianceScore(execution.complianceScore) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-foreground/45">
        Registrado em {execution.startedLabel} · origem {execution.source}
      </p>
    </section>
  );
}

/**
 * Per-dimension compliance as stored by `CalculateWorkoutCompliance`. Nothing is
 * recomputed here; unknown dimension keys are shown under their raw name rather
 * than dropped, so a new dimension is visible the day it starts being stored.
 */
export function ComplianceBreakdown({
  overallScore,
  breakdown,
}: {
  overallScore: number;
  breakdown: Record<string, number>;
}) {
  const dimensions = Object.entries(breakdown).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );

  return (
    <section className="space-y-2">
      <SectionTitle>Aderência por dimensão</SectionTitle>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-foreground/55">Compliance Ryvano</span>
          <span className="text-lg font-semibold tabular-nums">{formatComplianceScore(overallScore)}</span>
        </div>
        {dimensions.length > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {dimensions.map(([dimension, score]) => (
              <div key={dimension}>
                <dt className="text-xs text-foreground/50">
                  {COMPLIANCE_DIMENSION_LABELS[dimension] ?? dimension}
                </dt>
                <dd className="text-sm font-semibold tabular-nums">{(score / 10).toFixed(1)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
