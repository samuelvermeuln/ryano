-- SAM-60 — batch assignment with frozen recipients and per-recipient results. Additive.

CREATE TABLE "AssignmentBatch" (
    "id" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(200) NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "schoolId" TEXT,
    "teamId" TEXT,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AssignmentBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssignmentBatch_idempotencyKey_key" ON "AssignmentBatch"("idempotencyKey");
CREATE INDEX "AssignmentBatch_coachId_createdAt_idx" ON "AssignmentBatch"("coachId", "createdAt");
ALTER TABLE "AssignmentBatch" ADD CONSTRAINT "AssignmentBatch_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentBatch" ADD CONSTRAINT "AssignmentBatch_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AssignmentBatchRecipient" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(500),
    "assignmentId" TEXT,
    "overrides" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AssignmentBatchRecipient_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssignmentBatchRecipient_status_check" CHECK ("status" IN ('PENDING','OK','FAILED','BLOCKED','UNDONE'))
);
CREATE UNIQUE INDEX "AssignmentBatchRecipient_batchId_athleteId_key" ON "AssignmentBatchRecipient"("batchId", "athleteId");
ALTER TABLE "AssignmentBatchRecipient" ADD CONSTRAINT "AssignmentBatchRecipient_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AssignmentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentBatchRecipient" ADD CONSTRAINT "AssignmentBatchRecipient_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback (manual): DROP TABLE "AssignmentBatchRecipient"; DROP TABLE "AssignmentBatch";
