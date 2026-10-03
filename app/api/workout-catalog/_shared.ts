/** SAM-58 — thin adapters for the catalog: auth, parse, delegate (same envelope as the event routes). */
import { prisma } from "@/server/db";
import { WorkoutCatalog } from "@/modules/school/application/workout-catalog";

export { eventResponse as catalogResponse, parseJsonBody } from "../events/_shared";

export const catalog = new WorkoutCatalog(prisma);

export type TemplateRouteContext = { params: Promise<{ templateId: string }> };
