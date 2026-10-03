/**
 * SAM-74 — importing an activity file (§17.3, §18.3, §21.4, §20, AC21).
 *
 * The file goes through the same path a provider sync takes: parser →
 * canonical `NormalizedActivity` + rich detail → `Activity` with provider
 * `FILE` and a stable identifier (sha-256 of the bytes) → mirror detection
 * (`markDuplicateSession`, never deleting a look-alike from another provider)
 * → matching (`matchPersistedActivity`). Reimporting the same bytes finds the
 * same row and creates nothing. The bytes are kept privately (`StoredFile`),
 * downloadable only through the authenticated route that reapplies the
 * screens' authorization. Retention: while the activity exists, or until the
 * athlete deletes the file (Ryvano's own rows stay).
 */
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { matchPersistedActivity } from "@/modules/school/application/match-persisted-activity";
import { SchoolError } from "@/modules/school/domain/errors";
import { persistActivityDetail } from "@/modules/shared/activities/detail-ingestion";
import { markDuplicateSession } from "@/modules/shared/activities/duplicate-sessions";
import { loadExecutionLaps } from "@/modules/strava/application/activities/activity-visual-with-split-fallback";
import { ActivityFileError, parseActivityFile, SUPPORTED_EXTENSIONS } from "../parsers/parse-activity-file";

export const MAX_ACTIVITY_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export type ImportResult = { activityId: string; duplicate: boolean; format: string; matchStatus: string | null; poolLengthMeters: number | null };

export class ImportActivityFile {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, input: { filename: string; contentType: string | null; bytes: Uint8Array }): Promise<ImportResult> {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (input.bytes.length === 0) throw new SchoolError("ACTIVITY_FILE_INVALID", "O arquivo está vazio.", 422);
    if (input.bytes.length > MAX_ACTIVITY_FILE_BYTES) throw new SchoolError("ACTIVITY_FILE_INVALID", "O arquivo passa de 15 MB.", 422);
    const extension = input.filename.toLowerCase().split(".").pop() ?? "";
    if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(extension)) {
      throw new SchoolError("ACTIVITY_FILE_INVALID", "Formato não suportado. Aceitamos FIT, GPX 1.1 e TCX.", 422);
    }

    let parsed;
    try {
      parsed = parseActivityFile(input.filename, input.bytes);
    } catch (error) {
      if (error instanceof ActivityFileError) throw new SchoolError("ACTIVITY_FILE_INVALID", error.message, 422);
      throw new SchoolError("ACTIVITY_FILE_INVALID", "Não foi possível ler o arquivo. Ele pode estar corrompido.", 422);
    }

    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const externalId = `file:${sha256.slice(0, 40)}`;
    const existing = await this.db.activity.findUnique({ where: { provider_externalId_userId: { provider: "FILE", externalId, userId: actorUserId } }, select: { id: true } });
    if (existing) return { activityId: existing.id, duplicate: true, format: parsed.format, matchStatus: null, poolLengthMeters: parsed.poolLengthMeters };

    const now = this.clock();
    const connection = await this.db.wearableConnection.upsert({
      where: { userId_provider: { userId: actorUserId, provider: "FILE" } },
      update: {},
      create: { userId: actorUserId, provider: "FILE", status: "CONNECTED", capabilities: [], label: "Arquivos importados" },
      select: { id: true },
    });
    const { activity: normalized } = parsed;
    const activity = await this.db.activity.create({
      data: {
        userId: actorUserId, wearableConnectionId: connection.id, provider: "FILE", externalId,
        sportType: normalized.sportType, providerSportType: normalized.providerSportType, subSportType: normalized.providerSportType,
        name: input.filename.replace(/\.[^.]+$/, ""), startedAt: normalized.startedAt,
        durationSeconds: normalized.durationSeconds ?? null, movingSeconds: normalized.movingSeconds ?? null, distanceMeters: normalized.distanceMeters ?? null,
        averageHeartRate: normalized.averageHeartRate ?? null, maxHeartRate: normalized.maxHeartRate ?? null, averageSpeed: normalized.averageSpeed ?? null, maxSpeed: normalized.maxSpeed ?? null,
        averagePower: normalized.averagePower ?? null, maxPower: normalized.maxPower ?? null, elevationGain: normalized.elevationGain ?? null,
        metrics: { importedFile: { format: parsed.format, sha256, poolLengthMeters: parsed.poolLengthMeters } },
      },
    });
    await persistActivityDetail(this.db, activity.id, { ...parsed.detail, provider: "FILE", externalId }, now);
    await this.db.storedFile.create({
      data: { id: randomUUID(), ownerUserId: actorUserId, kind: "ACTIVITY_FILE", activityId: activity.id, filename: input.filename.slice(0, 200), contentType: input.contentType ?? "application/octet-stream", sizeBytes: input.bytes.length, sha256, bytes: Buffer.from(input.bytes), createdAt: now },
    });
    // Same order as the syncs: mirror detection (nothing deleted), then matching.
    const duplicate = await markDuplicateSession(this.db, activity);
    const current = duplicate.status === "marked" && duplicate.duplicateId === activity.id ? { ...activity, duplicateOfActivityId: duplicate.keepId } : activity;
    const matching = await matchPersistedActivity(this.db, current, { clock: this.clock, loadDetail: loadExecutionLaps });
    return { activityId: activity.id, duplicate: false, format: parsed.format, matchStatus: matching.matchStatus ?? null, poolLengthMeters: parsed.poolLengthMeters };
  }
}
