/**
 * SAM-17 — the activity behind an execution, as the coach reads it: time in
 * zones, laps, and the lap-by-block overlay against the prescription.
 *
 * Server Component friendly (no hooks, no motion): the numbers come
 * pre-computed from `modules/school/presentation/workout-insights.ts`, this
 * file only lays them out. Every chart carries its unit and a legend; a section
 * that has no data is not rendered, and the overlay explains itself when the
 * laps do not match the structure instead of forcing an alignment.
 */
import { formatDistance, formatDuration } from "@/lib/format";
import {
  formatLapCells,
  OVERLAY_VERDICT_LABELS,
  type LapRow,
  type OverlayRow,
  type OverlayVerdict,
  type WorkoutInsights,
  type ZoneSection,
} from "@/modules/school/presentation/workout-insights";
import { SectionTitle } from "./workout-structure";

const VERDICT_CLASS: Record<OverlayVerdict, string> = {
  within: "theme-pill-success",
  below: "theme-pill-warning",
  above: "theme-pill-danger",
  unknown: "theme-pill-neutral",
};

export function ZoneBars({ section }: { section: ZoneSection }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4" data-testid={`zones-${section.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{section.title}</p>
        <p className="text-xs text-foreground/50">
          {section.id === "power-zones" ? "tempo em cada zona (W)" : "tempo em cada zona (bpm)"}
        </p>
      </div>
      {section.approximate && section.disclaimer && (
        <p role="note" className="mt-1 text-xs text-foreground/55">{section.disclaimer}</p>
      )}
      <ul className="mt-3 space-y-2.5">
        {section.items.map((item) => (
          <li key={item.label} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-foreground/80">{item.label}</span>
              <span className="tabular-nums text-foreground/60">
                {item.valueText}
                {item.share !== null && !item.valueText.includes("%") ? ` · ${Math.round(item.share * 100)}%` : ""}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/8" aria-hidden="true">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(item.ratio * 100, 2)}%`, background: item.color }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LapsTable({ laps }: { laps: LapRow[] }) {
  const hasPower = laps.some((lap) => lap.averagePower !== null);
  const hasHeartRate = laps.some((lap) => lap.averageHeartRate !== null || lap.maxHeartRate !== null);
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10" data-testid="laps-table">
      <table className="w-full text-xs">
        <thead className="bg-white/5 text-foreground/50">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">Lap</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">Tempo</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Distância</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Duração</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Ritmo</th>
            {hasHeartRate && <th scope="col" className="px-3 py-2 text-right font-medium">FC méd / máx</th>}
            {hasPower && <th scope="col" className="px-3 py-2 text-right font-medium">Potência</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {laps.map((lap) => {
            const cells = formatLapCells(lap);
            return (
              <tr key={lap.index} data-testid="lap-row" data-recovery={lap.isRecovery ? "true" : undefined}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="font-medium">{lap.label}</span>
                  {lap.isRecovery && (
                    <span className="ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] theme-pill-neutral">recuperação</span>
                  )}
                </td>
                <td className="px-3 py-2 min-w-[7rem]">
                  <div className="h-2 overflow-hidden rounded-full bg-white/8" aria-hidden="true">
                    <div
                      className={`h-full rounded-full ${lap.isRecovery ? "bg-foreground/30" : "bg-primary/70"}`}
                      style={{ width: `${lap.ratio * 100}%` }}
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{cells.distance}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cells.duration}</td>
                <td className="px-3 py-2 text-right tabular-nums">{lap.paceLabel}</td>
                {hasHeartRate && <td className="px-3 py-2 text-right tabular-nums">{cells.heartRate}</td>}
                {hasPower && <td className="px-3 py-2 text-right tabular-nums">{cells.power}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OverlayTable({ rows }: { rows: OverlayRow[] }) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-white/10" data-testid="overlay-table">
        <table className="w-full text-xs">
          <thead className="bg-white/5 text-foreground/50">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">Segmento</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Prescrito</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Realizado (lap)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.segment} data-testid="overlay-row" data-verdict={row.verdict} data-kind={row.kind}>
                <td className="px-3 py-2">
                  <span className="font-medium">
                    {row.kind === "rest" ? "Descanso" : row.blockTitle}
                    {row.repetition !== null ? ` · rep. ${row.repetition}` : ""}
                  </span>
                  <span className="block text-foreground/50">#{row.segment}</span>
                </td>
                <td className="px-3 py-2 text-foreground/75">
                  {[
                    row.prescribed.durationS !== null ? formatDuration(row.prescribed.durationS) : null,
                    row.prescribed.distanceM !== null ? formatDistance(row.prescribed.distanceM) : null,
                    ...row.prescribed.targets,
                  ].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-3 py-2">
                  <span className="text-foreground/50">Lap {row.lapIndex} · </span>
                  {[
                    row.actual.durationSeconds !== null ? formatDuration(row.actual.durationSeconds) : null,
                    row.actual.distanceMeters !== null ? formatDistance(row.actual.distanceMeters) : null,
                    row.actual.paceLabel !== "—" ? row.actual.paceLabel : null,
                    row.actual.averageHeartRate !== null ? `${row.actual.averageHeartRate} bpm` : null,
                    row.actual.averagePower !== null ? `${row.actual.averagePower} W` : null,
                  ].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${VERDICT_CLASS[row.verdict]}`}>
                    {OVERLAY_VERDICT_LABELS[row.verdict]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-foreground/45">
        Resultado por FC média, ritmo (±5%) ou potência (±5%), nesta ordem, conforme o alvo do bloco.
        &ldquo;Abaixo&rdquo; é menos intensidade que o prescrito; &ldquo;Acima&rdquo;, mais.
      </p>
    </div>
  );
}

export function WorkoutInsightsSections({ insights }: { insights: WorkoutInsights }) {
  return (
    <>
      {insights.zones.length > 0 && (
        <section className="space-y-2" data-testid="insights-zones">
          <SectionTitle>Tempo em zonas</SectionTitle>
          <div className="grid gap-3 lg:grid-cols-2">
            {insights.zones.map((section) => <ZoneBars key={section.id} section={section} />)}
          </div>
        </section>
      )}
      {insights.laps.length > 0 && (
        <section className="space-y-2" data-testid="insights-laps">
          <SectionTitle>Laps da atividade</SectionTitle>
          <LapsTable laps={insights.laps} />
        </section>
      )}
      {(insights.overlay || insights.overlayNote) && (
        <section className="space-y-2" data-testid="insights-overlay">
          <SectionTitle>Prescrito × Realizado por bloco</SectionTitle>
          {insights.overlay
            ? <OverlayTable rows={insights.overlay} />
            : <p className="text-sm text-foreground/50">{insights.overlayNote}</p>}
        </section>
      )}
    </>
  );
}
