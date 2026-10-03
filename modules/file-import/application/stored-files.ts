/**
 * SAM-74 — private files (§20, AC21): the same authorization as the screens,
 * reapplied on every download. No public URL, no cache shared between users.
 *
 * - ACTIVITY_FILE: the athlete who owns it; a coach/school who can read the
 *   athlete's current data, or their history when the activity predates the
 *   follow-up (the hub's own rule).
 * - FEEDBACK_ATTACHMENT: the athlete of the session, or the session's coach
 *   who can still read the athlete.
 * Deleting is the owner's act and leaves the activity and Ryvano's rows.
 */
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { CanReadAthleteCurrentData } from "@/modules/school/application/can-read-athlete-current-data";
import { CanReadAthleteHistory } from "@/modules/school/application/can-read-athlete-history";
import { SchoolError } from "@/modules/school/domain/errors";
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from "./import-activity-file";

const notFound = () => new SchoolError("FILE_NOT_FOUND", "Arquivo não encontrado.", 404);

export async function listActivityFiles(db: PrismaClient, activityId: string) {
  return db.storedFile.findMany({ where: { activityId, kind: "ACTIVITY_FILE" }, orderBy: { createdAt: "asc" }, select: { id: true, filename: true, sizeBytes: true, createdAt: true } });
}

export class ReadStoredFile {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, fileId: string) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const file = await this.db.storedFile.findUnique({
      where: { id: fileId },
      include: {
        activity: { select: { userId: true, startedAt: true } },
        assignment: { select: { athleteId: true, schoolId: true, coach: { select: { userId: true } } } },
      },
    });
    if (!file) throw notFound();
    if (file.ownerUserId === actorUserId) return file;
    const now = this.clock();
    if (file.kind === "ACTIVITY_FILE" && file.activity) {
      const athleteId = file.activity.userId;
      // Any scope the actor has with this athlete: current data now, or history for an older activity.
      const current = await new CanReadAthleteCurrentData(this.db, () => now).execute(actorUserId, { athleteId, schoolId: null });
      const links = current ? [] : await this.db.coachAthleteAssignment.findMany({ where: { athleteId, status: "ACTIVE", coach: { userId: actorUserId } }, select: { schoolId: true } });
      let allowed = current;
      for (const link of links) {
        if (await new CanReadAthleteCurrentData(this.db, () => now).execute(actorUserId, { athleteId, schoolId: link.schoolId })) { allowed = true; break; }
        if (await new CanReadAthleteHistory(this.db, () => now).execute(actorUserId, { athleteId, schoolId: link.schoolId, category: "activities", occurredAt: file.activity.startedAt })) { allowed = true; break; }
      }
      if (!allowed) throw notFound();
      return file;
    }
    if (file.kind === "FEEDBACK_ATTACHMENT" && file.assignment) {
      const { athleteId, schoolId, coach } = file.assignment;
      if (athleteId === actorUserId) return file;
      if (coach?.userId === actorUserId && await new CanReadAthleteCurrentData(this.db, () => now).execute(actorUserId, { athleteId, schoolId })) return file;
      throw notFound();
    }
    throw notFound();
  }
}

export class DeleteStoredFile {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, fileId: string) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const removed = await this.db.storedFile.deleteMany({ where: { id: fileId, ownerUserId: actorUserId } });
    if (removed.count === 0) throw notFound();
  }
}

export class StoreFeedbackAttachment {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  /** The athlete of the session attaches an image or a PDF to their report; the path is the private route. */
  async execute(actorUserId: string | null, assignmentId: string, input: { filename: string; contentType: string; bytes: Uint8Array }) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (!(ATTACHMENT_TYPES as readonly string[]).includes(input.contentType)) throw new SchoolError("ATTACHMENT_INVALID", "Anexe uma imagem (JPEG, PNG, WebP) ou um PDF.", 422);
    if (input.bytes.length === 0 || input.bytes.length > MAX_ATTACHMENT_BYTES) throw new SchoolError("ATTACHMENT_INVALID", "O anexo deve ter até 10 MB.", 422);
    const assignment = await this.db.workoutAssignment.findUnique({ where: { id: assignmentId }, select: { athleteId: true } });
    if (!assignment || assignment.athleteId !== actorUserId) throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Treino não encontrado.", 404);
    const id = randomUUID();
    await this.db.storedFile.create({
      data: {
        id, ownerUserId: actorUserId, kind: "FEEDBACK_ATTACHMENT", workoutAssignmentId: assignmentId, filename: input.filename.slice(0, 200), contentType: input.contentType,
        sizeBytes: input.bytes.length, sha256: createHash("sha256").update(input.bytes).digest("hex"), bytes: Buffer.from(input.bytes), createdAt: this.clock(),
      },
    });
    return { fileId: id, path: `/api/files/${id}` };
  }
}
