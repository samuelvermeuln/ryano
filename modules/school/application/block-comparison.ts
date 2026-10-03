/**
 * SAM-72 — reads what the per-block comparison needs (§17.2, §17.4): the
 * version the athlete received, the linked activity's laps and samples (the
 * resolved detail of the session, one provider per field), and the
 * repetitions confirmed by the athlete or the coach. Confirming writes only
 * that count, with who and when; it never changes the prescription or the
 * activity.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { loadResolvedActivityDetail } from "@/modules/shared/activities/detail-ingestion/load-resolved-activity-detail";
import { compareBlocks, type SessionBlockComparison, type Streams } from "../domain/block-comparison";
import { SchoolError } from "../domain/errors";
import { asStructuredBlocks } from "../domain/workout-structure";
import { ACTIVE_MATCH_STATUSES } from "./match-audit";

type Db = PrismaClient;

/** `{blockIndex: {count, byUserId, role, at}}` on the execution. */
const confirmedSchema = z.record(z.string(), z.object({ count: z.number().int().min(0), byUserId: z.string(), role: z.enum(["athlete", "coach"]), at: z.string() }));

export function confirmedCounts(raw: unknown): Record<number, number> {
  const parsed = confirmedSchema.safeParse(raw ?? {});
  if (!parsed.success) return {};
  return Object.fromEntries(Object.entries(parsed.data).map(([index, entry]) => [Number(index), entry.count]));
}

function streamsOf(raw: Array<{ key: string; values: unknown[] }>): Streams | null {
  const series = (key: string) => raw.find((stream) => stream.key === key)?.values as Array<number | null> | undefined;
  const time = series("time");
  if (!time || time.length < 2) return null;
  return { time: time.map((value) => Number(value ?? 0)), distance: series("distance"), speed: series("speed"), heartRate: series("heartRate"), power: series("power") };
}

export async function loadBlockComparison(db: Db, assignmentId: string): Promise<{ comparison: SessionBlockComparison; streams: Streams | null } | null> {
  const assignment = await db.workoutAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      workout: { select: { blocks: { orderBy: { position: "asc" }, select: { blockType: true, title: true, durationS: true, distanceM: true, repetitions: true, targetPayload: true, restPayload: true } } } },
      executions: {
        where: { matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { confirmedRepetitions: true, activity: { select: { id: true, externalId: true, provider: true, duplicateOfActivityId: true } } },
      },
    },
  });
  const execution = assignment?.executions[0];
  // The comparison is against the version the athlete received (SAM-59), on the execution that exists.
  if (!assignment?.workout || !execution) return null;
  const blocks = asStructuredBlocks(assignment.workout.blocks.map((block) => ({ ...block, distanceM: block.distanceM === null ? null : Number(block.distanceM) })));
  const detail = execution.activity ? await loadResolvedActivityDetail(db, execution.activity).catch(() => null) : null;
  const streams = detail ? streamsOf(detail.streams as Array<{ key: string; values: unknown[] }>) : null;
  const laps = (detail?.laps ?? []).map((lap) => ({
    durationSeconds: lap.durationSeconds ?? null, distanceMeters: lap.distanceMeters ?? null,
    averageHeartRate: lap.averageHeartRate ?? null, averagePower: lap.averagePower ?? null,
  }));
  return { comparison: compareBlocks({ blocks, laps, streams, confirmedRepetitions: confirmedCounts(execution.confirmedRepetitions) }), streams };
}

const confirmSchema = z.strictObject({ blockIndex: z.number().int().min(0).max(100), count: z.number().int().min(0).max(200) });

export class ConfirmRepetitions {
  constructor(private readonly db: Db, private readonly clock: () => Date = () => new Date()) {}

  /** The athlete of the session or its coach; recorded on the linked execution. */
  async execute(actorUserId: string | null, assignmentId: string, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = confirmSchema.parse(raw);
    const assignment = await this.db.workoutAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        athleteId: true, coach: { select: { userId: true } },
        executions: { where: { matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true, confirmedRepetitions: true } },
      },
    });
    if (!assignment) throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Treino não encontrado.", 404);
    const role = assignment.athleteId === actorUserId ? "athlete" : assignment.coach?.userId === actorUserId ? "coach" : null;
    if (!role) throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Treino não encontrado.", 404);
    const execution = assignment.executions[0];
    if (!execution) throw new SchoolError("NO_EXECUTION", "Ainda não há execução registrada para esta sessão.", 409);
    const current = confirmedSchema.safeParse(execution.confirmedRepetitions ?? {});
    const next = { ...(current.success ? current.data : {}), [String(input.blockIndex)]: { count: input.count, byUserId: actorUserId, role, at: this.clock().toISOString() } };
    await this.db.workoutExecution.update({ where: { id: execution.id }, data: { confirmedRepetitions: next as Prisma.InputJsonValue } });
    return { blockIndex: input.blockIndex, count: input.count, role };
  }
}
