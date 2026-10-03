-- SAM-57 — athlete unavailability periods shown on the calendar. Additive.

CREATE TABLE "AthleteUnavailability" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "startLocalDate" VARCHAR(10) NOT NULL,
    "endLocalDate" VARCHAR(10) NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AthleteUnavailability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AthleteUnavailability_dates_check" CHECK ("endLocalDate" >= "startLocalDate")
);
CREATE INDEX "AthleteUnavailability_athleteId_startLocalDate_idx" ON "AthleteUnavailability"("athleteId", "startLocalDate");
ALTER TABLE "AthleteUnavailability" ADD CONSTRAINT "AthleteUnavailability_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteUnavailability" ADD CONSTRAINT "AthleteUnavailability_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback (manual): DROP TABLE "AthleteUnavailability";
