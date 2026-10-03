/**
 * SAM-60 — reads the references a relative target resolves against: the
 * athlete's technical sheet IN THE COACH'S SCOPE (school or independent),
 * with the id of its latest revision so the snapshot names exactly which
 * sheet state was used (§18.2, AC14).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { SheetReferences } from "../domain/relative-targets";
import { technicalSheetScope } from "./coach-athlete-scope";

type Db = PrismaClient | Prisma.TransactionClient;

export async function loadSheetReferences(db: Db, context: { coachId: string; schoolId: string | null }, athleteId: string): Promise<SheetReferences> {
  const sheet = await db.athleteTechnicalSheet.findFirst({
    where: technicalSheetScope(context, athleteId).where,
    select: {
      id: true, ftpWatts: true, cssSecPer100m: true, thresholdPaceSecPerKm: true, thresholdHeartRate: true, maxHeartRate: true, restingHeartRate: true,
      revisions: { orderBy: { changedAt: "desc" }, take: 1, select: { id: true } },
    },
  });
  return {
    sheetRevisionId: sheet?.revisions[0]?.id ?? sheet?.id ?? null,
    ftpWatts: sheet?.ftpWatts ?? null,
    cssSecPer100m: sheet?.cssSecPer100m ?? null,
    thresholdPaceSecPerKm: sheet?.thresholdPaceSecPerKm ?? null,
    thresholdHeartRate: sheet?.thresholdHeartRate ?? null,
    maxHeartRate: sheet?.maxHeartRate ?? null,
    restingHeartRate: sheet?.restingHeartRate ?? null,
  };
}
