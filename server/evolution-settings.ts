import { prisma } from "@/server/db";
import { isEvolutionHttpFallbackAllowed } from "@/server/env";

export async function getStoredEvolutionHttpFallbackAllowed() {
  const latestConfigUpdate = await prisma.adminAuditLog.findFirst({
    where: {
      action: "EVOLUTION_WEBHOOK_CONFIG_UPDATE",
      entityType: "EVOLUTION_INSTANCE",
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      metadata: true,
    },
  });

  const metadata = latestConfigUpdate?.metadata as { allowHttpFallback?: unknown } | null;

  return typeof metadata?.allowHttpFallback === "boolean"
    ? metadata.allowHttpFallback
    : isEvolutionHttpFallbackAllowed();
}
