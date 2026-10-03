/**
 * SAM-74 — POST /api/workout-assignments/:id/attachments (multipart `file`):
 * the athlete attaches an image or a PDF to their report; returns the private path.
 */
import { prisma } from "@/server/db";
import { StoreFeedbackAttachment } from "@/modules/file-import/application/stored-files";
import { SchoolError } from "@/modules/school/domain/errors";
import { eventResponse } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const store = new StoreFeedbackAttachment(prisma);
type Context = { params: Promise<{ id: string }> };

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new SchoolError("ATTACHMENT_INVALID", "Envie uma imagem ou um PDF.", 422);
    return store.execute(actorId, (await context.params).id, { filename: file.name, contentType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
  }, 201);
}