/**
 * SAM-33 — "atividade não planejada" tem uma definição só: uma `Activity`
 * importada que nenhuma execução casada (AUTO_MATCHED/CONFIRMED/OVERRIDDEN)
 * aponta — pelo `activityId` explícito (SAM-17) ou pelo par legado
 * `(UPPER(source), externalId)`. Esta regra era inline em
 * `loadAthleteSessions`; agora o resumo, a análise, as listas de atividades e
 * o calendário leem daqui, e nada é contado duas vezes.
 *
 * Provider-agnóstico: `provider` e `source` são comparados como texto, sem
 * conhecer Garmin ou Strava.
 */
import type { PrismaClient } from "@prisma/client";
import { MATCHED_EXECUTION_STATUSES } from "./athlete-training-scope";

export type ExecutionLink = {
  activityId: string | null;
  source: string;
  externalId: string;
};

export type LinkableActivity = {
  id: string;
  provider: string;
  externalId: string;
};

export type LinkedActivityKeys = {
  ids: ReadonlySet<string>;
  external: ReadonlySet<string>;
};

export function activityLinkKey(provider: string, externalId: string): string {
  return `${provider.trim().toUpperCase()}:${externalId}`;
}

/** The two indexes an execution may use to point at its activity. */
export function linkedActivityKeys(executions: readonly ExecutionLink[]): LinkedActivityKeys {
  const ids = new Set<string>();
  const external = new Set<string>();
  for (const execution of executions) {
    if (execution.activityId) ids.add(execution.activityId);
    external.add(activityLinkKey(execution.source, execution.externalId));
  }
  return { ids, external };
}

export function isActivityLinked(activity: LinkableActivity, keys: LinkedActivityKeys): boolean {
  return keys.ids.has(activity.id) || keys.external.has(activityLinkKey(activity.provider, activity.externalId));
}

/** Splits imported activities into those behind an execution and those nobody matched. */
export function splitLinkedActivities<T extends LinkableActivity>(
  executions: readonly ExecutionLink[],
  activities: readonly T[],
): { linked: T[]; unlinked: T[] } {
  const keys = linkedActivityKeys(executions);
  const linked: T[] = [];
  const unlinked: T[] = [];
  for (const activity of activities) {
    (isActivityLinked(activity, keys) ? linked : unlinked).push(activity);
  }
  return { linked, unlinked };
}

type UnplannedDb = Pick<PrismaClient, "activity" | "workoutExecution">;

export type UnplannedActivitiesWindow = {
  athleteId: string;
  from: Date;
  /** Exclusive. */
  until: Date;
  sportType?: string;
};

/**
 * Imported activities of one athlete inside a window that no matched
 * execution claims. The caller decides who may read them (scope, period and
 * consent); this only answers "which rows are unplanned".
 */
export async function listUnplannedActivities(db: UnplannedDb, window: UnplannedActivitiesWindow) {
  const sportFilter = window.sportType ? { sportType: window.sportType } : {};
  const range = { gte: window.from, lt: window.until };
  const [executions, activities] = await Promise.all([
    db.workoutExecution.findMany({
      where: {
        athleteId: window.athleteId,
        matchStatus: { in: MATCHED_EXECUTION_STATUSES },
        startedAt: range,
      },
      select: { activityId: true, source: true, externalId: true },
    }),
    db.activity.findMany({
      where: { userId: window.athleteId, startedAt: range, ...sportFilter },
      orderBy: { startedAt: "desc" },
    }),
  ]);
  return splitLinkedActivities(executions, activities).unlinked;
}
