-- T152: Explicit coach–team assignments.
-- Allows a coach to be assigned to one or more specific teams within their school,
-- enabling team-scoped workout assignment and athlete oversight.
CREATE TABLE "TeamCoach" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamCoach_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamCoach_teamId_coachId_key" ON "TeamCoach"("teamId", "coachId");
CREATE INDEX "TeamCoach_coachId_idx" ON "TeamCoach"("coachId");

ALTER TABLE "TeamCoach" ADD CONSTRAINT "TeamCoach_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamCoach" ADD CONSTRAINT "TeamCoach_coachId_fkey"
    FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
