/**
 * SAM-55 — server-side loader shared by the coach and school "Pendências"
 * pages; serializes dates for the client panel.
 */
import { prisma } from "@/server/db";
import { ListFollowUpTasks, type FollowUpTaskView } from "@/modules/school/application/follow-up-tasks";
import type { FollowUpItem } from "./follow-up-panel";

function toItem(task: FollowUpTaskView): FollowUpItem {
  return {
    id: task.id,
    title: task.title,
    href: task.href,
    athleteName: task.athleteName,
    queue: task.queue,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString() ?? null,
    rescheduledTo: task.rescheduledTo?.toISOString() ?? null,
    overdue: task.overdue,
    createdAt: task.createdAt.toISOString(),
    version: task.version,
    transitions: task.transitions.map((transition) => ({ ...transition, at: transition.at.toISOString() })),
  };
}

export async function loadFollowUps(actorUserId: string, search: { dias?: string; status?: string }, filter?: (task: FollowUpTaskView) => boolean) {
  const days = search.dias && /^\d+$/.test(search.dias) ? Number(search.dias) : null;
  const showClosed = search.status === "all";
  const result = await new ListFollowUpTasks(prisma).execute(actorUserId, { status: showClosed ? "all" : "open", ...(days ? { days } : {}) });
  const tasks = filter ? result.tasks.filter(filter) : result.tasks;
  // Counters follow the same scope as the list (school page = that school only).
  const all = filter ? (await new ListFollowUpTasks(prisma).execute(actorUserId, { status: "all", ...(days ? { days } : {}) })).tasks.filter(filter) : null;
  const counters = all
    ? {
      open: all.filter((task) => ["NEW", "SEEN", "IN_PROGRESS", "RESCHEDULED"].includes(task.status)).length,
      overdue: all.filter((task) => task.overdue).length,
      resolved: all.filter((task) => task.status === "RESOLVED").length,
    }
    : result.counters;
  return { counters, periodDays: result.periodDays, tasks: tasks.map(toItem), showClosed };
}
