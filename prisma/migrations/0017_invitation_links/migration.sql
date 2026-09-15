-- Additive invitation links. Public bearer tokens are never persisted.
CREATE TYPE "InvitationType" AS ENUM ('SCHOOL', 'SCHOOL_COACH', 'COACH');
CREATE TYPE "InvitationStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'EXHAUSTED');

CREATE TABLE "InvitationLink" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR NOT NULL,
    "type" "InvitationType" NOT NULL,
    "schoolId" TEXT,
    "coachId" TEXT,
    "createdBy" TEXT NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "InvitationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "InvitationLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvitationLink_tokenHash_check" CHECK (length(btrim("tokenHash")) > 0),
    CONSTRAINT "InvitationLink_scope_check" CHECK (
        ("type" = 'SCHOOL' AND "schoolId" IS NOT NULL AND "coachId" IS NULL)
        OR ("type" = 'SCHOOL_COACH' AND "schoolId" IS NOT NULL AND "coachId" IS NOT NULL)
        OR ("type" = 'COACH' AND "schoolId" IS NULL AND "coachId" IS NOT NULL)
    ),
    CONSTRAINT "InvitationLink_usage_check" CHECK (
        "usedCount" >= 0 AND ("maxUses" IS NULL OR ("maxUses" > 0 AND "usedCount" <= "maxUses"))
    ),
    CONSTRAINT "InvitationLink_revokedAt_check" CHECK (
        ("status" = 'REVOKED') = ("revokedAt" IS NOT NULL)
    ),
    CONSTRAINT "InvitationLink_exhausted_check" CHECK (
        "status" <> 'EXHAUSTED' OR ("maxUses" IS NOT NULL AND "usedCount" = "maxUses")
    ),
    CONSTRAINT "InvitationLink_expired_check" CHECK (
        "status" <> 'EXPIRED' OR "expiresAt" IS NOT NULL
    )
);

CREATE UNIQUE INDEX "InvitationLink_tokenHash_key" ON "InvitationLink"("tokenHash");
CREATE INDEX "InvitationLink_schoolId_status_idx" ON "InvitationLink"("schoolId", "status");
CREATE INDEX "InvitationLink_coachId_status_idx" ON "InvitationLink"("coachId", "status");
CREATE INDEX "InvitationLink_createdBy_idx" ON "InvitationLink"("createdBy");
CREATE INDEX "InvitationLink_status_expiresAt_idx" ON "InvitationLink"("status", "expiresAt");

ALTER TABLE "InvitationLink" ADD CONSTRAINT "InvitationLink_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvitationLink" ADD CONSTRAINT "InvitationLink_coachId_fkey"
FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvitationLink" ADD CONSTRAINT "InvitationLink_createdBy_fkey"
FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
