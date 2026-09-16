-- Explicit, revocable read access to athlete-owned historical data.
CREATE TYPE "HistoryGranteeType" AS ENUM ('SCHOOL', 'COACH');
CREATE TYPE "HistoryGrantStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "HistoryAccessGrant" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "granteeType" "HistoryGranteeType" NOT NULL,
    "granteeId" TEXT NOT NULL,
    "schoolId" TEXT,
    "coachId" TEXT,
    "scope" JSONB NOT NULL,
    "fromDate" DATE,
    "toDate" DATE,
    "status" "HistoryGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedBy" TEXT,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HistoryAccessGrant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HistoryAccessGrant_period_check" CHECK (
        "fromDate" IS NULL OR "toDate" IS NULL OR "fromDate" <= "toDate"
    ),
    CONSTRAINT "HistoryAccessGrant_recipient_check" CHECK (
        ("granteeType" = 'SCHOOL' AND "schoolId" IS NOT NULL AND "schoolId" = "granteeId" AND "coachId" IS NULL)
        OR ("granteeType" = 'COACH' AND "coachId" IS NOT NULL AND "coachId" = "granteeId" AND "schoolId" IS NULL)
    ),
    CONSTRAINT "HistoryAccessGrant_revocation_check" CHECK (
        ("status" = 'REVOKED') = ("revokedAt" IS NOT NULL)
    )
);

CREATE INDEX "HistoryAccessGrant_athleteId_status_grantedAt_id_idx"
ON "HistoryAccessGrant"("athleteId", "status", "grantedAt", "id");
CREATE INDEX "HistoryAccessGrant_granteeType_granteeId_status_idx"
ON "HistoryAccessGrant"("granteeType", "granteeId", "status");
CREATE INDEX "HistoryAccessGrant_schoolId_status_idx"
ON "HistoryAccessGrant"("schoolId", "status");
CREATE INDEX "HistoryAccessGrant_coachId_status_idx"
ON "HistoryAccessGrant"("coachId", "status");

ALTER TABLE "HistoryAccessGrant" ADD CONSTRAINT "HistoryAccessGrant_athleteId_fkey"
FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoryAccessGrant" ADD CONSTRAINT "HistoryAccessGrant_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoryAccessGrant" ADD CONSTRAINT "HistoryAccessGrant_coachId_fkey"
FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoryAccessGrant" ADD CONSTRAINT "HistoryAccessGrant_grantedBy_fkey"
FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoryAccessGrant" ADD CONSTRAINT "HistoryAccessGrant_revokedBy_fkey"
FOREIGN KEY ("revokedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
