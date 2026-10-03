/**
 * SAM-74 — POST /api/activities/import (multipart, field `file`): FIT/GPX/TCX
 * → the same path a sync takes. 201 with { activityId, duplicate, format,
 * matchStatus }; 422 with a readable message when the file cannot be read.
 */
import { prisma } from "@/server/db";
import { ImportActivityFile } from "@/modules/file-import/application/import-activity-file";
import { SchoolError } from "@/modules/school/domain/errors";
import { eventResponse } from "../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const importer = new ImportActivityFile(prisma);

export function POST(request: Request) {
  return eventResponse(async (actorId) => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new SchoolError("ACTIVITY_FILE_INVALID", "Envie um arquivo FIT, GPX ou TCX.", 422);
    return importer.execute(actorId, { filename: file.name, contentType: file.type || null, bytes: new Uint8Array(await file.arrayBuffer()) });
  }, 201);
}