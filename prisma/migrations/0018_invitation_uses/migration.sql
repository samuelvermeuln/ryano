-- Additive invitation-use audit trail; no existing migration or data is changed.
CREATE TYPE "InvitationUseResult" AS ENUM ('PENDING_APPROVAL', 'JOINED', 'REJECTED', 'FAILED');

CREATE TABLE "InvitationUse" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "athleteId" TEXT,
    "usedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "InvitationUseResult" NOT NULL,

    CONSTRAINT "InvitationUse_pkey" PRIMARY KEY ("id")
);

-- Repeated attempts and later re-entry remain separate audit events.
-- Acceptance must guard capacity and duplicate active memberships transactionally.
CREATE INDEX "InvitationUse_invitationId_usedAt_id_idx" ON "InvitationUse"("invitationId", "usedAt", "id");
CREATE INDEX "InvitationUse_userId_usedAt_id_idx" ON "InvitationUse"("userId", "usedAt", "id");
CREATE INDEX "InvitationUse_athleteId_usedAt_id_idx" ON "InvitationUse"("athleteId", "usedAt", "id");

ALTER TABLE "InvitationUse" ADD CONSTRAINT "InvitationUse_invitationId_fkey"
FOREIGN KEY ("invitationId") REFERENCES "InvitationLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvitationUse" ADD CONSTRAINT "InvitationUse_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvitationUse" ADD CONSTRAINT "InvitationUse_athleteId_fkey"
FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
