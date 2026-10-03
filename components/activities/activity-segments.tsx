/**
 * SAM-75 — "Segmentos e transições" of an activity: the provider's legs with
 * T1/T2, per-sport copies counted once, and the trechos selected by the
 * athlete or the coach (each optionally answering one prescription).
 */
import { formatDistance, formatDuration } from "@/lib/format";
import { loadActivitySegments } from "@/modules/shared/activities/application/multisport";
import { SEGMENT_LABELS } from "@/modules/shared/activities/domain/multisport";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { prisma } from "@/server/db";
import { SegmentSelectionForm } from "./segment-selection-form";

export async function ActivitySegmentsSection({ activityId, canSelect, linkableSessions = [] }: { activityId: string; canSelect: boolean; linkableSessions?: Array<{ id: string; title: string }> }) {
  const activity = await prisma.activity.findUnique({ where: { id: activityId }, select: { id: true, metrics: true, durationSeconds: true, parentActivityId: true } });
  if (!activity) return null;
  const view = await loadActivitySegments(prisma, activity);
  if (view.provider.length === 0 && view.selections.length === 0 && view.children.length === 0 && !canSelect) return null;
  return (
    <section className="space-y-3 rounded-[20px] border border-white/10 bg-white/5 p-4" data-testid="activity-segments">
      <h2 className="text-sm font-semibold">Segmentos e transições</h2>
      {activity.parentActivityId && <p className="text-xs text-foreground/60">Esta é uma cópia por esporte de uma sessão multiesporte: não entra de novo nos totais.</p>}
      {view.provider.length > 0 && (
        <ol className="space-y-1 text-sm" data-testid="provider-segments">
          {view.provider.map((segment) => (
            <li key={segment.order} data-testid="activity-segment" data-kind={segment.kind}>
              {SEGMENT_LABELS[segment.kind]}{segment.sportType ? ` (${resolveSportLabel(segment.sportType) ?? segment.sportType})` : ""}: {formatDuration(segment.durationSeconds)}
              {segment.distanceMeters !== null ? ` · ${formatDistance(segment.distanceMeters)}` : ""}
            </li>
          ))}
          <li className="text-xs text-foreground/60" data-testid="segment-totals">
            Transições {formatDuration(view.totals.transitionSeconds)} · total {formatDuration(view.totals.totalSeconds)} — {view.totals.legend}
          </li>
        </ol>
      )}
      {view.children.length > 0 && (
        <p className="text-xs text-foreground/60" data-testid="child-copies">
          Cópias por esporte do provedor (contadas uma vez): {view.children.map((child) => `${resolveSportLabel(child.sportType) ?? child.sportType} ${child.durationSeconds ? formatDuration(child.durationSeconds) : ""}`.trim()).join(" · ")}
        </p>
      )}
      {view.selections.length > 0 && (
        <ul className="space-y-1 text-sm" data-testid="selected-segments">
          {view.selections.map((segment) => (
            <li key={segment.id}>
              Trecho {segment.label ? `"${segment.label}"` : ""} {formatDuration(segment.startOffsetSeconds)} → {formatDuration(segment.endOffsetSeconds)} ({formatDuration(segment.durationSeconds)})
              {segment.assignment ? ` · responde à prescrição "${segment.assignment.title}"` : ""} · {segment.origin === "COACH_SELECTION" ? "professor" : "aluno"}
            </li>
          ))}
        </ul>
      )}
      {canSelect && activity.durationSeconds && <SegmentSelectionForm activityId={activity.id} durationSeconds={activity.durationSeconds} sessions={linkableSessions} />}
    </section>
  );
}
