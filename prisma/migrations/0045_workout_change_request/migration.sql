-- WorkoutChangeRequest — school administration asks the authoring coach to
-- revise a prescription that already happened.
--
-- Purely additive: one new enum and one new table, no change to existing rows,
-- so this is safe to apply on a live database.
--
-- Why a new table instead of reusing WorkoutRequest: that one is athlete→coach
-- ("prescribe me something") and ends by CREATING a WorkoutAssignment via its
-- unique resultingAssignmentId. This one is admin→coach, targets an assignment
-- that ALREADY EXISTS, and never produces one. Folding both into a single table
-- would make resultingAssignmentId meaningless for half the rows and turn every
-- query into a discriminator filter.

CREATE TYPE "WorkoutChangeRequestStatus" AS ENUM (
    'PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'DECLINED', 'CANCELLED'
);

CREATE TABLE "WorkoutChangeRequest" (
    "id"                  TEXT                         NOT NULL,
    "schoolId"            TEXT                         NOT NULL,
    "workoutAssignmentId" TEXT                         NOT NULL,
    "coachId"             TEXT                         NOT NULL,
    "requestedBy"         TEXT                         NOT NULL,
    "reason"              VARCHAR(2000)                NOT NULL,
    "status"              "WorkoutChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedBy"          TEXT,
    "resolvedAt"          TIMESTAMPTZ(3),
    "resolutionNote"      VARCHAR(2000),
    "createdAt"           TIMESTAMPTZ(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMPTZ(3)               NOT NULL,

    CONSTRAINT "WorkoutChangeRequest_pkey" PRIMARY KEY ("id")
);

-- The open/closed invariant is also enforced in the domain entity
-- (workout-change-request.ts). It is repeated here because the database is the
-- last line of defence: a request that is still open must carry no resolution,
-- and a closed one must say who closed it and when.
ALTER TABLE "WorkoutChangeRequest"
    ADD CONSTRAINT "WorkoutChangeRequest_resolution_matches_status_check" CHECK (
        (
            "status" IN ('PENDING', 'ACKNOWLEDGED')
            AND "resolvedBy" IS NULL AND "resolvedAt" IS NULL AND "resolutionNote" IS NULL
        )
        OR (
            "status" IN ('RESOLVED', 'DECLINED', 'CANCELLED')
            AND "resolvedBy" IS NOT NULL AND "resolvedAt" IS NOT NULL
        )
    );

ALTER TABLE "WorkoutChangeRequest"
    ADD CONSTRAINT "WorkoutChangeRequest_resolvedAt_after_createdAt_check"
    CHECK ("resolvedAt" IS NULL OR "resolvedAt" >= "createdAt");

-- Restrict everywhere, matching the module invariant that ending a
-- relationship never deletes history.
ALTER TABLE "WorkoutChangeRequest"
    ADD CONSTRAINT "WorkoutChangeRequest_schoolId_fkey"
        FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "WorkoutChangeRequest_workoutAssignmentId_fkey"
        FOREIGN KEY ("workoutAssignmentId") REFERENCES "WorkoutAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "WorkoutChangeRequest_coachId_fkey"
        FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "WorkoutChangeRequest_requestedBy_fkey"
        FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "WorkoutChangeRequest_resolvedBy_fkey"
        FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- "Open requests for this school" (admin inbox) and "open requests for this
-- coach" (the coach's own queue) are the two hot reads.
CREATE INDEX "WorkoutChangeRequest_schoolId_status_idx"
    ON "WorkoutChangeRequest" ("schoolId", "status");
CREATE INDEX "WorkoutChangeRequest_coachId_status_idx"
    ON "WorkoutChangeRequest" ("coachId", "status");
CREATE INDEX "WorkoutChangeRequest_workoutAssignmentId_createdAt_idx"
    ON "WorkoutChangeRequest" ("workoutAssignmentId", "createdAt");

-- Rollback (manual, in reverse order):
--   DROP TABLE IF EXISTS "WorkoutChangeRequest";
--   DROP TYPE IF EXISTS "WorkoutChangeRequestStatus";
-- Dropping the table discards the revision history between administration and
-- coaches; export before rolling back in production.
