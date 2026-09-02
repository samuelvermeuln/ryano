import {
  processPendingStravaWebhookEvents,
  type ProcessPendingStravaWebhookEventsResult,
} from "@/modules/strava/webhooks";
import {
  runStravaRetentionCleanup,
  type RunStravaRetentionCleanupResult,
} from "@/modules/strava/application/cleanup";
import {
  syncAllStravaUsers,
  type SyncAllStravaUsersResult,
} from "@/modules/strava/application/sync";

type StepResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: string };

export interface StravaWebhookJobDependencies {
  processWebhookEvents?: () => Promise<ProcessPendingStravaWebhookEventsResult>;
}

export interface StravaDailyMaintenanceJobDependencies {
  syncAllUsers?: () => Promise<SyncAllStravaUsersResult>;
  runRetentionCleanup?: () => Promise<RunStravaRetentionCleanupResult>;
}

export interface StravaWebhookJobResult {
  ok: boolean;
  webhook: StepResult<ProcessPendingStravaWebhookEventsResult>;
  errors: string[];
}

export interface StravaDailyMaintenanceJobResult {
  ok: boolean;
  sync: StepResult<SyncAllStravaUsersResult>;
  cleanup: StepResult<RunStravaRetentionCleanupResult>;
  errors: string[];
}

async function runStep<T>(label: string, fn: () => Promise<T>): Promise<StepResult<T>> {
  try {
    return { ok: true, result: await fn() };
  } catch (error) {
    const message =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : error instanceof Error
          ? error.name
          : "UNKNOWN_ERROR";
    return { ok: false, error: `${label}:${message}` };
  }
}

export async function runStravaWebhookJob(
  dependencies: StravaWebhookJobDependencies = {},
): Promise<StravaWebhookJobResult> {
  const webhook = await runStep(
    "webhook",
    dependencies.processWebhookEvents ?? processPendingStravaWebhookEvents,
  );
  const errors = webhook.ok ? [] : [webhook.error];

  return { ok: errors.length === 0, webhook, errors };
}

export async function runStravaDailyMaintenanceJob(
  dependencies: StravaDailyMaintenanceJobDependencies = {},
): Promise<StravaDailyMaintenanceJobResult> {
  const sync = await runStep("sync", dependencies.syncAllUsers ?? syncAllStravaUsers);
  const cleanup = await runStep(
    "cleanup",
    dependencies.runRetentionCleanup ?? runStravaRetentionCleanup,
  );
  const errors = [sync, cleanup]
    .filter((step): step is { ok: false; error: string } => !step.ok)
    .map((step) => step.error);

  return { ok: errors.length === 0, sync, cleanup, errors };
}
