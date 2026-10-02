import type { LapsModel } from "@/modules/shared/activities/presentation/activity-detail-model";

/**
 * SAM-40 — the laps/splits of the activity as a table: only the columns the
 * provider sent (absence is no column), "—" for a missing cell, a summary row
 * with totals and duration-weighted averages. Server Component.
 */
export function ActivityLapsTable({ laps }: { laps: LapsModel }) {
  const noun = laps.vocabulary === "lap" ? "Volta" : "Split";
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-[20px] border border-border theme-panel-neutral">
        <table className="min-w-full text-sm" data-testid="activity-laps-table">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.14em] text-foreground/55">
              <th scope="col" className="px-4 py-3">{noun}</th>
              {laps.columns.map((column) => (
                <th key={column.key} scope="col" className="px-4 py-3 text-right">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {laps.rows.map((row) => (
              <tr key={row.number} className="border-t border-border" data-testid="activity-lap-row">
                <th scope="row" className="px-4 py-2 text-left font-medium text-foreground">{row.number}</th>
                {laps.columns.map((column) => (
                  <td key={column.key} className="px-4 py-2 text-right tabular-nums text-foreground/85">{row.cells[column.key] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-semibold" data-testid="activity-lap-summary">
              <th scope="row" className="px-4 py-3 text-left text-foreground">{laps.summary.number}</th>
              {laps.columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-right tabular-nums text-foreground">{laps.summary.cells[column.key] ?? "—"}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {laps.sourceNote && <p className="text-xs text-foreground/55">{laps.sourceNote}</p>}
    </div>
  );
}
