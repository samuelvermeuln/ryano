/**
 * SAM-49 — a prescription's persisted blocks as the provider-agnostic
 * `PlannedWorkoutStep[]` sent to a watch. One mapper for the preview and the
 * push, so what the athlete is shown is what is sent.
 *
 * The rest duration lives in `restPayload.durationS` (written by the
 * prescription use cases); the old route read `durationSeconds`, so rest never
 * reached the watch.
 */
import { sessionContentV2Schema } from "../domain/session-content-v2";
import { planExport } from "@/modules/shared/integrations/planned-workout-v2";
import type { PrismaClient } from "@prisma/client";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { PlannedWorkoutStep } from "@/modules/shared/integrations/contracts";
import type { ProviderId } from "@/modules/shared/integrations/types";

/**
 * SAM-49 — whether the athlete has a connected account whose provider
 * declares `plannedWorkoutPush` (catalog capability, never the provider name).
 */
export async function canReceivePlannedWorkouts(db: Pick<PrismaClient, "wearableConnection">, userId: string): Promise<boolean> {
  return (await plannedWorkoutProviderFor(db, userId)) !== null;
}

/** SAM-77 — the first connected provider that declares `plannedWorkoutPush`, for the capability-driven v2 plan. */
export async function plannedWorkoutProviderFor(db: Pick<PrismaClient, "wearableConnection">, userId: string): Promise<ProviderId | null> {
  const connections = await db.wearableConnection.findMany({
    where: { userId, status: "CONNECTED" },
    select: { provider: true },
    orderBy: { createdAt: "asc" },
  });
  const found = connections.find((connection) => getProviderDefinition(connection.provider as ProviderId)?.capabilities.plannedWorkoutPush === true);
  return found ? (found.provider as ProviderId) : null;
}

/**
 * SAM-77 — whether THIS session can go to the watch of that provider: a v2
 * session whose every step is omitted hides the button (§11.4); v1 always can.
 */
export function sessionExportable(snapshotPayload: unknown, providerId: ProviderId | null): boolean {
  if (!providerId) return false;
  const raw = (snapshotPayload as { content?: { session?: unknown } } | null)?.content?.session;
  const parsed = raw ? sessionContentV2Schema.safeParse(raw) : null;
  if (!parsed?.success) return true;
  return planExport(parsed.data, getProviderDefinition(providerId)?.capabilities ?? {}).unsupported === null;
}

export type PrescriptionBlockRow = {
  blockType: string;
  title: string | null;
  durationS: number | null;
  distanceM: number | string | { toNumber(): number } | null;
  repetitions: number | null;
  targetPayload: unknown;
  restPayload: unknown;
};

const STEP_TYPES = new Set<PlannedWorkoutStep["stepType"]>(["WARMUP", "INTERVAL", "STEADY", "RECOVERY", "COOLDOWN", "DRILL", "FREE", "CUSTOM"]);

function num(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toPlannedWorkoutSteps(blocks: readonly PrescriptionBlockRow[]): PlannedWorkoutStep[] {
  return blocks.map((block) => {
    const target = block.targetPayload && typeof block.targetPayload === "object" ? block.targetPayload : null;
    const rest = block.restPayload && typeof block.restPayload === "object" ? block.restPayload : null;
    return {
      stepType: STEP_TYPES.has(block.blockType as PlannedWorkoutStep["stepType"]) ? (block.blockType as PlannedWorkoutStep["stepType"]) : "CUSTOM",
      title: block.title,
      durationSeconds: block.durationS,
      distanceMeters: block.distanceM == null ? null : Number(block.distanceM),
      repetitions: block.repetitions,
      target: target ? {
        heartRateMin: num(target, "heartRateMin"),
        heartRateMax: num(target, "heartRateMax"),
        power: num(target, "power"),
        paceSecPerKm: num(target, "paceSecPerKm"),
        paceSec100m: num(target, "paceSec100m"),
        zone: num(target, "zone"),
        rpe: num(target, "rpe"),
      } : null,
      rest: rest ? {
        durationSeconds: num(rest, "durationS") ?? num(rest, "durationSeconds"),
        heartRateMin: num(rest, "heartRateMin"),
        heartRateMax: num(rest, "heartRateMax"),
      } : null,
    };
  });
}
