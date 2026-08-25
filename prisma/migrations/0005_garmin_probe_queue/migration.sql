ALTER TABLE "WearableConnection"
ADD COLUMN "lastProbeAt" TIMESTAMP(3),
ADD COLUMN "nextProbeAt" TIMESTAMP(3),
ADD COLUMN "lastSeenActivityExternalId" TEXT,
ADD COLUMN "lastProbeStatus" TEXT,
ADD COLUMN "lastProbeErrorCode" TEXT,
ADD COLUMN "lastProbeFailureCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "WearableConnection_provider_nextProbeAt_idx"
ON "WearableConnection"("provider", "nextProbeAt");
