/**
 * SAM-74 — GET /api/files/:id downloads a private file after reapplying the
 * screens' authorization (404 for anyone else, AC21); DELETE is the owner's.
 * `Cache-Control: private, no-store`: nothing is cached across users.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { auth } from "@/server/auth";
import { DeleteStoredFile, ReadStoredFile } from "@/modules/file-import/application/stored-files";
import { SchoolError } from "@/modules/school/domain/errors";
import { eventResponse } from "../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reader = new ReadStoredFile(prisma);
const remover = new DeleteStoredFile(prisma);
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  try {
    const file = await reader.execute(session?.user?.id ?? null, (await context.params).id);
    const safeName = file.filename.replace(/[^\w.\-]+/g, "_");
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "content-type": file.contentType,
        "content-length": String(file.sizeBytes),
        "content-disposition": `${file.contentType.startsWith("image/") || file.contentType === "application/pdf" ? "inline" : "attachment"}; filename="${safeName}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof SchoolError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}

export function DELETE(_request: Request, context: Context) {
  return eventResponse(async (actorId) => {
    await remover.execute(actorId, (await context.params).id);
    return { ok: true };
  });
}