-- Additive DB-first rollout: existing membership rows and writers are unchanged.
-- Prisma generates CUIDs in the client; the database stores opaque TEXT IDs.
-- Prisma migration history applies this migration once (no manual reapplication).
CREATE TYPE "SchoolRole" AS ENUM ('OWNER', 'ADMIN', 'COACH', 'ASSISTANT_COACH', 'STAFF', 'ATHLETE', 'GUARDIAN');

CREATE TABLE "SchoolMembershipRole" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "role" "SchoolRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolMembershipRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolMembershipRole_membershipId_role_key"
ON "SchoolMembershipRole"("membershipId", "role");

ALTER TABLE "SchoolMembershipRole" ADD CONSTRAINT "SchoolMembershipRole_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "SchoolMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
