# Escola Module — Domain Events (T362)

These are **implicit domain events** — state transitions written to `SchoolAuditLog`
(and reflected in structured logs via `schoolLogger`). The school module does not use an
event-bus or outbox yet; this document captures the logical event model so future integration
with a message broker requires no archaeology.

Each entry lists: **event name**, the **use case** that emits it, the fields written to
`SchoolAuditLog.metadata`, and the actor/entity scoping.

---

## Member lifecycle events

| Event | Use case | entityType | Key metadata fields |
|---|---|---|---|
| `school.created` | `CreateSchool` | `school` | `name`, `slug` |
| `school.updated` | `UpdateSchool` | `school` | changed field names |
| `school.deactivated` | `DeactivateSchool` | `school` | `cascadedMemberships` count |
| `school.reactivated` | `ReactivateSchool` | `school` | — |
| `membership.granted` | `AddSchoolMember` | `school_membership` | `userId`, `role` |
| `membership.role_added` | `GrantRole` | `school_membership_role` | `role` |
| `membership.role_revoked` | `RevokeRole` | `school_membership_role` | `role` |
| `membership.ended` | `EndMembership` | `school_membership` | `userId` |

---

## Athlete membership events

| Event | Use case | entityType | Key metadata fields |
|---|---|---|---|
| `athlete_membership.requested` | `RequestSchoolMembership` / `AcceptInvitation` | `school_athlete_membership` | `athleteId`, `joinSource` |
| `athlete_membership.approved` | `ApproveAthleteMembership` | `school_athlete_membership` | `athleteId`, `approvedBy` |
| `athlete_membership.rejected` | `RejectAthleteMembership` | `school_athlete_membership` | `athleteId`, `rejectedBy` |
| `athlete_membership.ended` | `EndAthleteMembership` | `school_athlete_membership` | `athleteId` |
| `athlete_membership.revoked` | `RevokeAthleteMembership` | `school_athlete_membership` | `athleteId`, `revokedBy`, `reason` |

---

## Coach membership events

| Event | Use case | entityType | Key metadata fields |
|---|---|---|---|
| `coach_membership.requested` | `RequestCoachMembership` | `coach_school_membership` | `coachId` |
| `coach_membership.approved` | `ApproveCoachMembership` | `coach_school_membership` | `coachId`, `approvedBy` |
| `coach_membership.rejected` | `RejectCoachMembership` | `coach_school_membership` | `coachId` |
| `coach_membership.ended` | `EndCoachMembership` | `coach_school_membership` | `coachId` |

---

## Coach assignment events

| Event | Use case | entityType | Key metadata fields |
|---|---|---|---|
| `coach_assignment.created` | `AssignCoachToAthlete` | `coach_athlete_assignment` | `coachId`, `athleteId`, `isPrimary` |
| `coach_assignment.changed` | `ChangeAthleteCoach` | `coach_athlete_assignment` | `previousCoachId`, `newCoachId`, `athleteId` |
| `coach_assignment.ended` | `EndCoachAssignment` | `coach_athlete_assignment` | `coachId`, `athleteId` |

---

## Invitation events

| Event | Use case | entityType | Key metadata fields |
|---|---|---|---|
| `invitation.created` | `CreateInvitationLink` | `invitation_link` | `type`, `schoolId`, `coachId?`, `maxUses` |
| `invitation.accepted` | `AcceptInvitation` | `invitation_use` | `userId`, `athleteId?`, `result` |
| `invitation.revoked` | `RevokeInvitation` | `invitation_link` | `revokedBy` |
| `invitation.expired` | — (check at accept time) | — | not audited; detected by status |

> ⚠️ `tokenHash` is never included in metadata. The raw token is never logged.

---

## Workout prescription events

| Event | Use case | entityType | Key metadata fields |
|---|---|---|---|
| `workout.assigned` | `AssignWorkout` | `workout_assignment` | `workoutId`, `athleteId`, `scheduledAt`, `schoolId` |
| `workout.rescheduled` | `RescheduleWorkout` | `workout_assignment` | `oldScheduledAt`, `newScheduledAt` |
| `workout.cancelled` | `CancelWorkout` | `workout_assignment` | `reason?` |
| `workout.completed` | `MatchActivityToWorkout` (auto) / `MarkWorkoutCompleted` | `workout_assignment` | `executionId`, `matchSource` |

---

## Execution and compliance events

| Event | Use case | entityType | Key metadata fields |
|---|---|---|---|
| `execution.matched` | `MatchActivityToWorkout` | `workout_execution` | `activityId`, `matchScore`, `matchStatus` |
| `execution.unmatched` | `UnmatchExecution` | `workout_execution` | `reason` |
| `compliance.calculated` | `CalculateWorkoutCompliance` | `workout_compliance` | `overallScore`, `strategyKey`, `algorithmVersion` |

---

## Evaluation and feedback events

| Event | Use case | entityType | Key metadata fields |
|---|---|---|---|
| `evaluation.created` | `CreateCoachEvaluation` | `coach_evaluation` | `coachId`, `athleteId`, `overallScore`, `isVisible` |
| `evaluation.updated` | `UpdateCoachEvaluation` | `coach_evaluation` | changed fields |
| `feedback.submitted` | `SubmitAthleteFeedback` | `athlete_feedback` | `athleteId`, `rating?` |

---

## History access events

| Event | Use case | entityType | Key metadata fields |
|---|---|---|---|
| `history_grant.created` | `GrantHistoryAccess` | `history_access_grant` | `granteeType`, `granteeId`, `scope`, `fromDate`, `toDate?` |
| `history_grant.revoked` | `RevokeHistoryAccess` | `history_access_grant` | `revokedBy` |

---

## Future: outbox / event-bus integration

When the Escola module needs to publish events externally (push notifications, analytics,
webhooks), add an `outbox` table and emit inside the same transaction as the state change.
Do not call external services from within a use case.

Event names follow `<aggregate>.<past_tense_verb>` convention.
