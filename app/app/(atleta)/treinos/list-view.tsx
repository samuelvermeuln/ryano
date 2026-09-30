import { mergeTimelineItems, groupTimelineByDay } from "./timeline";
import { TreinosEmptyState } from "./treinos-empty-state";
import { WorkoutCard } from "./workout-card";
import { ActivityCard } from "./activity-card";
import type { AssignmentWithDetails, ActivityListItem } from "./queries";

export function ListView({
  assignments,
  activities,
}: {
  assignments: AssignmentWithDetails[];
  activities: ActivityListItem[];
}) {
  const groups = groupTimelineByDay(mergeTimelineItems(assignments, activities));

  if (groups.length === 0) {
    return (
      <TreinosEmptyState
        title="Nada por aqui neste mês."
        description="Treinos prescritos e atividades registradas aparecem juntos aqui, em ordem cronológica."
      />
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.isoDate} className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-foreground/40">{group.label}</p>
          <div className="space-y-2">
            {group.items.map((item) =>
              item.kind === "assignment" ? (
                <WorkoutCard key={`a-${item.data.id}`} assignment={item.data} />
              ) : (
                <ActivityCard key={`c-${item.data.id}`} activity={item.data} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
