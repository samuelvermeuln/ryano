/** SAM-66 — PUT /api/events/participations/[participationId]/result — record or edit the result of this prova. */
import { prisma } from "@/server/db";
import { RecordParticipationResult } from "@/modules/school/application/participation-results";
import { eventResponse, parseJsonBody } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const recordResult = new RecordParticipationResult(prisma);

export function PUT(request: Request, { params }: { params: Promise<{ participationId: string }> }) {
  return eventResponse(async (actorId) => {
    const { participationId } = await params;
    return recordResult.execute(actorId, participationId, await parseJsonBody(request));
  });
}