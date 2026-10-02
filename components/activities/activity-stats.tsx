import type { ActivityFeedbackModel, StatGroup } from "@/modules/shared/activities/presentation/activity-detail-model";
import type { ActivityMetricSection } from "@/modules/shared/activities/presentation/activity-visual-data";

const MOOD_LABELS = ["", "Muito ruim", "Ruim", "Neutro", "Bem", "Muito bem"];
const ENERGY_LABELS = ["", "Esgotado", "Baixa", "Normal", "Boa", "Cheia"];

function StatCard({ title, rows, note, testId }: { title: string; rows: Array<{ label: string; value: string; note?: string }>; note?: string; testId: string }) {
  return (
    <section className="rounded-[20px] border border-border theme-panel-neutral p-5" data-testid={testId}>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {note && <p className="mt-1 text-xs text-foreground/60">{note}</p>}
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-border/60 px-4 py-3">
            <dt className="text-xs uppercase tracking-[0.14em] text-foreground/55">{row.label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{row.value}</dd>
            {row.note && <dd className="mt-0.5 text-xs text-foreground/55">{row.note}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * SAM-40 — the "Estatísticas" tab: the adaptive summary, the extended stats
 * (only what the provider sent), the legacy workout analysis when present and
 * the athlete's self-assessment. Server Component.
 */
export function ActivityStats({ groups, analysis, feedback, sources }: {
  groups: StatGroup[];
  analysis: ActivityMetricSection[];
  feedback: ActivityFeedbackModel | null;
  sources: string[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <StatCard key={group.id} title={group.title} rows={group.rows} note={group.sourceNote} testId={`activity-stats-${group.id}`} />
        ))}
        {analysis.map((section) => (
          <StatCard key={section.id} title={section.title} rows={section.metrics} note={section.description} testId={`activity-analysis-${section.id}`} />
        ))}
        {feedback && (
          <StatCard
            title="Autoavaliação"
            testId="activity-feedback"
            rows={[
              { label: "Esforço percebido (RPE)", value: `${feedback.rpe}/10` },
              ...(feedback.mood ? [{ label: "Humor", value: MOOD_LABELS[feedback.mood] ?? String(feedback.mood) }] : []),
              ...(feedback.energy ? [{ label: "Energia", value: ENERGY_LABELS[feedback.energy] ?? String(feedback.energy) }] : []),
              ...(feedback.comment ? [{ label: "Comentário", value: feedback.comment }] : []),
            ]}
          />
        )}
      </div>
      {sources.length > 0 && (
        <p className="text-xs text-foreground/55" data-testid="activity-sources">{sources.join(" · ")}</p>
      )}
    </div>
  );
}
