/** SAM-60 — thin adapters for batch assignment. */
import { prisma } from "@/server/db";
import { AssignmentBatches } from "@/modules/school/application/assignment-batches";

export { eventResponse as batchResponse, parseJsonBody } from "../events/_shared";

export const batches = new AssignmentBatches(prisma);

export type BatchRouteContext = { params: Promise<{ batchId: string }> };
