import Link from "next/link";

import { humanizeActivityLabel } from "@/lib/activity-text";
import { formatDistance, formatDuration } from "@/lib/format";
import { STATUS_CONFIG, sportEmoji } from "./constants";
import type { AssignmentWithDetails } from "./queries";

/** Card for a single prescribed WorkoutAssignment — shared by day/week/list views. */
export function WorkoutCard({ assignment }: { assignment: AssignmentWithDetails }) {
  const cfg = STATUS_CONFIG[assignment.status] ?? {
    label: assignment.status,
    dot: "bg-foreground/20",
    ring: "border-white/8",
  };
  const exec = assignment.executions[0] ?? null;
  const workout = assignment.workout;
  const templateName = assignment.workoutTemplate?.title;
  const sportType = workout?.sportType ?? assignment.workoutTemplate?.sportType ?? "";

  const prescribedDuration = workout?.blocks.reduce((s, b) => s + (b.durationS ?? 0), 0) ?? 0;
  const prescribedDistance = workout?.blocks.reduce((s, b) => s + Number(b.distanceM ?? 0), 0) ?? 0;

  const isMatched = !!exec;
  const schoolPath = assignment.school ? `/atleta/${assignment.school.id}/treinos/${assignment.id}` : "#";

  return (
    <Link
      href={schoolPath}
      className={["flex gap-3 rounded-xl border px-3.5 py-3 hover:opacity-90 transition-opacity", cfg.ring].join(" ")}
    >
      <span className="text-2xl leading-none mt-0.5 shrink-0">{sportEmoji(sportType)}</span>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold truncate">
            {workout?.title ?? templateName ?? "Treino agendado"}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {isMatched && (
              <span
                className="text-[10px] font-bold text-emerald-400 bg-emerald-500/12 rounded-full px-1.5 py-0.5 leading-none"
                title="Atividade registrada"
              >
                ✓
              </span>
            )}
            <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} title={cfg.label} />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap text-xs text-foreground/45">
          <span className="font-medium text-foreground/60">
            {humanizeActivityLabel(sportType) ?? sportType}
          </span>
          {assignment.school && (
            <>
              <span className="text-foreground/25">·</span>
              <span>{assignment.school.name}</span>
            </>
          )}
          {assignment.coach && (
            <>
              <span className="text-foreground/25">·</span>
              <span>{assignment.coach.displayName}</span>
            </>
          )}
          <span className="text-foreground/25">·</span>
          <span
            className={[
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              cfg.dot === "bg-emerald-500"
                ? "bg-emerald-500/15 text-emerald-400"
                : cfg.dot === "bg-destructive"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-white/6 text-foreground/45",
            ].join(" ")}
          >
            {cfg.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-0.5">
          {(prescribedDuration > 0 || prescribedDistance > 0) && (
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider text-foreground/30 font-semibold">Prescrito</p>
              <div className="flex gap-2 text-xs text-foreground/55">
                {prescribedDuration > 0 && <span>{formatDuration(prescribedDuration)}</span>}
                {prescribedDistance > 0 && <span>{formatDistance(prescribedDistance)}</span>}
              </div>
            </div>
          )}

          {exec && (exec.durationSeconds != null || exec.distanceMeters != null) && (
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400/60 font-semibold">Realizado</p>
              <div className="flex gap-2 text-xs text-emerald-400/80">
                {exec.durationSeconds != null && <span>{formatDuration(exec.durationSeconds)}</span>}
                {exec.distanceMeters != null && <span>{formatDistance(exec.distanceMeters)}</span>}
                {exec.averageHeartRate != null && (
                  <span className="text-foreground/40">♡ {exec.averageHeartRate} bpm</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
