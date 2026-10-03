import type { ActivityFeedbackModel, StatGroup } from "@/modules/shared/activities/presentation/activity-detail-model";
import type { ActivityMetricSection } from "@/modules/shared/activities/presentation/activity-visual-data";

const MOOD_LABELS = ["", "Muito ruim", "Ruim", "Neutro", "Bem", "Muito bem"];
const ENERGY_LABELS = ["", "Esgotado", "Baixa", "Normal", "Boa", "Cheia"];

type StatRowLike = { label: string; value: string; note?: string };

/**
 * SAM-40 — the body of one statistics card (the card frame, drag and resize
 * handles come from the activity's card grid). Server Component.
 */
export function StatCardContent({ title, rows, note, testId }: { title: string; rows: StatRowLike[]; note?: string; testId: string }) {
  return (
    <section data-testid={testId}>
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

export function StatGroupContent({ group }: { group: StatGroup }) {
  return <StatCardContent title={group.title} rows={group.rows} note={group.sourceNote} testId={`activity-stats-${group.id}`} />;
}

export function AnalysisSectionContent({ section }: { section: ActivityMetricSection }) {
  return <StatCardContent title={section.title} rows={section.metrics} note={section.description} testId={`activity-analysis-${section.id}`} />;
}

export function FeedbackContent({ feedback }: { feedback: ActivityFeedbackModel }) {
  return (
    <StatCardContent
      title="Autoavaliação"
      testId="activity-feedback"
      rows={[
        // SAM-61 — RPE only when it was asked for: absence is "não informado", never zero.
        { label: "Esforço percebido (RPE)", value: feedback.rpe === null ? "não informado" : `${feedback.rpe}/10` },
        ...(feedback.mood ? [{ label: "Humor", value: MOOD_LABELS[feedback.mood] ?? String(feedback.mood) }] : []),
        ...(feedback.energy ? [{ label: "Energia", value: ENERGY_LABELS[feedback.energy] ?? String(feedback.energy) }] : []),
        ...(feedback.comment ? [{ label: "Comentário", value: feedback.comment }] : []),
      ]}
    />
  );
}
