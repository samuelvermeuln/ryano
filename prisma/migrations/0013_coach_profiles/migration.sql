-- Additive DB-first rollout: a coach profile belongs to a user, independently of schools.
-- Prisma supplies CUID IDs and updatedAt; retain historical profiles on application rollback.
CREATE TYPE "CoachStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

CREATE TABLE "CoachProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" VARCHAR NOT NULL,
    "bio" TEXT,
    "status" "CoachStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CoachProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachProfile_userId_key" ON "CoachProfile"("userId");

ALTER TABLE "CoachProfile" ADD CONSTRAINT "CoachProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
