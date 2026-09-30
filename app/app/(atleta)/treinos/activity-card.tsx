import Link from "next/link";

import { humanizeActivityLabel } from "@/lib/activity-text";
import { formatDistance, formatDuration } from "@/lib/format";
import { ACTIVITY_ACCENT, sportEmoji } from "./constants";
import type { ActivityListItem } from "./queries";

function providerLabel(provider: string) {
  return provider.charAt(0) + provider.slice(1).toLowerCase();
}

/** Card for a real executed Activity (Garmin/Strava/etc) inside the unified
 *  list view. No relation to any WorkoutAssignment is implied or looked up —
 *  the accent color and "Registrado via ..." badge are what tell it apart
 *  from a prescribed WorkoutCard. */
export function ActivityCard({ activity }: { activity: ActivityListItem }) {
  return (
    <Link
      href={`/app/atividades/${activity.id}`}
      className={["flex gap-3 rounded-xl border px-3.5 py-3 hover:opacity-90 transition-opacity", ACTIVITY_ACCENT.ring].join(" ")}
    >
      <span className="text-2xl leading-none mt-0.5 shrink-0">{sportEmoji(activity.sportType)}</span>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold truncate">
            {activity.name ?? humanizeActivityLabel(activity.sportType) ?? "Atividade"}
          </p>
          <span className={`w-2 h-2 rounded-full shrink-0 ${ACTIVITY_ACCENT.dot}`} title="Atividade real" />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap text-xs text-foreground/45">
          <span className="font-medium text-foreground/60">
            {humanizeActivityLabel(activity.sportType) ?? activity.sportType}
          </span>
          <span className="text-foreground/25">·</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-indigo-400/12 ${ACTIVITY_ACCENT.label}`}>
            Registrado via {providerLabel(activity.provider)}
          </span>
        </div>

        {(activity.durationSeconds != null || activity.distanceMeters != null) && (
          <div className="flex gap-2 text-xs text-foreground/55 pt-0.5">
            {activity.durationSeconds != null && <span>{formatDuration(activity.durationSeconds)}</span>}
            {activity.distanceMeters != null && <span>{formatDistance(activity.distanceMeters)}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}
