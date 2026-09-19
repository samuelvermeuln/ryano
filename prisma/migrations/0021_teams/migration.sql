-- Escola-scoped teams for grouping athletes and bulk-assigning workouts.
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamAthlete" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamAthlete_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Team_schoolId_archivedAt_idx" ON "Team"("schoolId", "archivedAt");
CREATE UNIQUE INDEX "TeamAthlete_teamId_athleteId_key" ON "TeamAthlete"("teamId", "athleteId");

ALTER TABLE "Team" ADD CONSTRAINT "Team_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamAthlete" ADD CONSTRAINT "TeamAthlete_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamAthlete" ADD CONSTRAINT "TeamAthlete_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
