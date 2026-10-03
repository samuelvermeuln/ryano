/**
 * SAM-75 — §16.3/§16.5: the brick as prescribed and as executed — order,
 * each leg, the real interval between legs (a transition, or a separate
 * session hours later) and the total elapsed with its legend.
 */
import { formatDuration } from "@/lib/format";
import { brickOf } from "@/modules/shared/activities/application/multisport";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { formatScheduledDateTime } from "@/modules/school/presentation/format";
import { prisma } from "@/server/db";
import { BrickLinkForm } from "./brick-link-form";

export async function BrickCard({ assignmentId, timeZone, linkable = [] }: { assignmentId: string; timeZone: string; linkable?: Array<{ id: string; title: string }> }) {
  const brick = await brickOf(prisma, assignmentId);
  if (!brick && linkable.length === 0) return null;
  return (
    <section className="space-y-2 rounded-[20px] border border-white/10 bg-white/5 p-4" data-testid="brick-card">
      <h2 className="text-sm font-semibold">Brick: etapas e intervalo real</h2>
      {brick ? (
        <>
          <ol className="space-y-1 text-sm">
            {brick.legs.map((leg) => (
              <li key={leg.assignmentId} data-testid="brick-leg" data-interval-label={leg.intervalLabel ?? ""}>
                {leg.order}. {leg.title} ({resolveSportLabel(leg.sportType) ?? leg.sportType})
                {leg.startedAt ? ` · ${formatScheduledDateTime(leg.startedAt, timeZone)}` : ""}
                {leg.durationSeconds !== null ? ` · ${formatDuration(leg.durationSeconds)}` : ""}
                {leg.executed ? "" : " · não executada"}
                {leg.intervalSeconds !== null ? ` · intervalo real desde a etapa anterior: ${formatDuration(leg.intervalSeconds)} (${leg.intervalLabel})` : leg.intervalLabel ? ` · ${leg.intervalLabel}` : ""}
              </li>
            ))}
          </ol>
          {brick.elapsedSeconds !== null && <p className="text-xs text-foreground/60" data-testid="brick-elapsed">Total decorrido: {formatDuration(brick.elapsedSeconds)} — {brick.elapsedLegend}</p>}
          <p className="text-xs text-foreground/55">O arquivo multiesporte e as cópias por esporte não são contados de novo nos totais.</p>
        </>
      ) : null}
      {linkable.length > 0 && <BrickLinkForm assignmentId={assignmentId} others={linkable} />}
    </section>
  );
}
