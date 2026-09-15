-- CreateEnum
CREATE TYPE "SchoolStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SchoolJoinPolicy" AS ENUM ('AUTO_APPROVE', 'REQUIRE_APPROVAL', 'INVITE_ONLY');

-- CreateEnum
CREATE TYPE "CoachSelectionPolicy" AS ENUM ('ATHLETE_CHOOSES', 'ADMIN_ASSIGNS', 'AUTO_LOBBY', 'INVITE_DEFINES_COACH');

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "status" "SchoolStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinPolicy" "SchoolJoinPolicy" NOT NULL DEFAULT 'REQUIRE_APPROVAL',
    "coachSelectionPolicy" "CoachSelectionPolicy" NOT NULL DEFAULT 'ADMIN_ASSIGNS',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deactivatedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");

-- CreateIndex
CREATE INDEX "School_ownerUserId_status_idx" ON "School"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "School_status_name_id_idx" ON "School"("status", "name", "id");

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
