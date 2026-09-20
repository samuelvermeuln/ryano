# Ryvano Escola — Project Memory

## E2E Test Patterns (tests/*.test.ts)

### Mock helpers
- `withTx(db)` — wraps a plain mock object with `$transaction: vi.fn().mockImplementation((fn) => fn(db))`. Use whenever the use case calls `this.db.$transaction`.
- `makeOwnerMembership()` — returns `{ id: "owner-mbr-1", userId: IDS.owner, schoolId: IDS.school, status: "ACTIVE", endedAt: null }` for CanManageSchool.

### CanManageSchool / CanManageMembers / CanDeactivateSchool
All three use `SchoolMembershipRepository` → needs both:
1. `schoolMembership.findFirst` (status: "ACTIVE", schoolId+userId match, endedAt: null)
2. `schoolMembershipRole.findMany({ where: { membershipId } })` → array with role OWNER or ADMIN

`CanDeactivateSchool` filters roles to OWNER only.

### SchoolAthleteMembership schema rules (domain/school-athlete-membership.ts)
- PENDING: `startedAt: null, endedAt: null`
- ACTIVE: `startedAt: non-null, endedAt: null, approvedAt: non-null`
- ENDED: `startedAt: non-null, endedAt: non-null` (no constraint on approvedAt)
- REJECTED: `startedAt: null, endedAt: non-null, rejectedAt: non-null`
- REVOKED: `startedAt: non-null, endedAt: non-null, revokedAt: non-null`
- Valid transitions: PENDING→ACTIVE|REJECTED; ACTIVE→ENDED|REVOKED

### CoachAthleteAssignment schema (domain/coach-athlete-assignment.ts)
Required fields: `id, athleteId, coachId, schoolId(nullable), isPrimary, sportType(nullable), status, startedAt(nullable), endedAt(nullable), assignedBy(nullable), endedBy(nullable), createdAt, updatedAt`

### joinSource valid values
`"SCHOOL_INVITE" | "SCHOOL_COACH_INVITE" | "COACH_INVITE" | "MANUAL_SEARCH" | "ADMIN_CREATED" | "MIGRATION"` (NOT "INVITE")

### assignCoachToAthleteInTransaction
Used internally by `AssignCoachToAthlete` AND `ChangeAthleteCoach`. Calls:
1. `CanManageMembers.assert` → needs `schoolMembership.findFirst` + `schoolMembershipRole.findMany`
2. `coachSchoolMembership.findFirst` (active coach)
3. `schoolAthleteMembership.findFirst` (active athlete)
4. `coachAthleteAssignment.findFirst` (findActivePrimaryBySchoolAndAthlete — must return null for new assignment)

When testing ChangeAthleteCoach, make `coachAthleteAssignment.findFirst` dynamic (returns old assignment before update, null after).

### AcceptInvitation
- Calls `invitationLink.findUnique` twice (select: `{id, createdBy}` then full fields via ResolveInvitationLink)
- Calls `invitationUse.findFirst` (replay check)
- For dynamic token matching, capture the created invite in a variable and reference it in findUnique mock

### SchoolService.deactivate
Needs: `$transaction`, `school.findUnique`, `school.findUniqueOrThrow`, `school.updateMany` (sets INACTIVE), `schoolMembership.findFirst+updateMany`, `schoolMembershipRole.findMany`, `schoolAthleteMembership.updateMany`, `coachSchoolMembership.updateMany`, `coachAthleteAssignment.updateMany`, `workoutAssignment.findMany+updateMany`, `workoutAssignmentHistory.createMany`, `adminAuditLog.create`

## Task Status (as of 2026-09-16, session 3)
- T290–T300, T310–T315, T317, T319, T330–T348: ALL DONE ✓
- T316: DONE ✓ — 7 indexes (0029 migration); non-blocking CREATE INDEX IF NOT EXISTS
- T360–T367: ALL DONE ✓ — school.yaml updated + 6 arch docs + prisma/seed.ts + pnpm db:seed
- Last commit: `feat(escola): T316/T360-T367 — indexes, docs, seed, migration checklist, rollback plan`
- Tests: 1872 passing | tsc clean (0 errors)
- Remaining: T318 BLOCKED (T110), T368–T372 infra activation (staging/prod)

### Key Implementation Notes (session 2)
- `makeWorkoutRow()` needs `scheduledDate/scheduledStartAt: NOW` to achieve AUTO_MATCHED score (≥80)
  - Without scheduled dates, composite = ~68 < STRONG_MATCH_THRESHOLD (80) → PENDING
- `CalculateWorkoutCompliance.execute`: throws EXECUTION_NOT_FOUND (not scorable state) when execution is null
- Logging: `schoolLogger(operation)` → per-call instance with auto-generated correlationId
- Security fix: GET /api/workout-assignments requires schoolId + active membership when querying other athlete
- Security fix: GET /api/workout-executions/[id]/evaluation scoped: athlete=visible, coach=own, other=empty

## Task Status (as of 2026-09-16, session 3)
- T367–T368: DONE — feature flag bypass dev/staging
- T400–T406: DONE — TrainingProduct marketplace domain + catalog + purchase + license calendar
- T407: PENDENTE — Integrar plano comprado ao compliance
- T369, T370: PENDENTE — Smoke test staging, flag interno
- **1895 tests | tsc clean**

### WorkoutAssignment entity changes (T406)
workoutId + assignedBy NOW NULLABLE. New fields (all nullable): workoutTemplateId, matchStatus, matchedActivityId, matchedAt, matchScore, trainingLicenseId. All createWorkoutAssignment() call sites must supply these. UI pages use `a.workout?.title ?? "Treino agendado"`. match/compliance modules skip null-workout assignments.

### TrainingProduct marketplace (T400–T406)
Entities: training-product.ts (schoolId XOR coachId, priceCents+currency pair), training-product-version.ts (planPayload weeks/days), training-purchase.ts, training-license.ts (REVOKED requires revokedAt). ListTrainingProducts use-case + GET /api/training-products (cursor-paginated, defaults PUBLISHED). CreateTrainingPurchase: atomic purchase+license in $transaction. InstantiateLicenseCalendar: idempotent (calendarInstantiated flag), toMonday() anchor, workoutId=null assignments. Migrations: 0030, 0031.

