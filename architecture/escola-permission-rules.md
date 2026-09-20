# Escola Module — Permission Rules (T363)

Derived from `CanManageSchool`, `CanManageMembers`, `CanDeactivateSchool`, domain invariants,
and route-level authorization guards. **Actor identity always comes from the server session;
role claims from request bodies are never trusted.**

---

## 1. Identity and session

| Rule | Detail |
|---|---|
| Every mutation requires an authenticated session | Routes call `auth()` and check `session.user.id`; no API route accepts an `actorId` from the client |
| Unauthenticated requests receive `401 UNAUTHORIZED` | `SchoolError("UNAUTHORIZED", …, 401)` |
| Feature flag gates all routes | `assertSchoolModuleEnabled()` at every route entry point; returns `404` when disabled |

---

## 2. School management actions

> Enforced by `CanManageSchool` (`modules/school/application/can-manage-school.ts`)

| Action | Required role |
|---|---|
| Create school | Any authenticated user (becomes OWNER on creation) |
| Update school details | OWNER or ADMIN |
| Deactivate school | OWNER only |
| Reactivate school | OWNER only |
| Invite members (create invitation link) | OWNER or ADMIN |
| Revoke invitation | OWNER or ADMIN |

`CanManageSchool` checks:
1. The actor has an `ACTIVE` `SchoolMembership` at the school with `endedAt = null`
2. That membership has a `SchoolMembershipRole` of `OWNER` or `ADMIN`

---

## 3. Member management actions

> Enforced by `CanManageMembers` (`modules/school/application/can-manage-members.ts`)

| Action | Required role |
|---|---|
| List school members | OWNER or ADMIN |
| Add member directly | OWNER or ADMIN |
| Approve athlete membership request | OWNER or ADMIN |
| Reject athlete membership request | OWNER or ADMIN |
| Approve coach membership request | OWNER or ADMIN |
| Reject coach membership request | OWNER or ADMIN |
| End athlete membership | OWNER or ADMIN |
| Assign / change athlete's primary coach | OWNER or ADMIN |

`CanManageMembers` uses the same membership + role check as `CanManageSchool` (OWNER or ADMIN).

---

## 4. Athlete self-service

| Action | Who |
|---|---|
| Request school membership | Any authenticated user (self only) |
| Accept invitation | The session user (athleteId = session.user.id) |
| Rejoin school after ENDED membership | Self only |
| Grant history access | The athlete themselves (`actorUserId` = `athleteId`) |
| Revoke history access grant | The athlete themselves |

**Athletes cannot act on behalf of other athletes.** The `actorUserId` is always derived from
the session, never from the request body.

---

## 5. Workout prescription

| Action | Who |
|---|---|
| Create workout template | Authenticated coach or admin |
| Assign workout to athlete | Coach with an active `CoachSchoolMembership` at the school AND active `CoachAthleteAssignment` with that athlete |
| Reschedule / cancel workout assignment | Same coach who assigned it (`assignedBy = actor`) |
| List own workout assignments | The athlete themselves |
| List athlete assignments (coach view) | Requires active `SchoolMembership` at the school |

---

## 6. Workout execution and compliance

| Action | Who |
|---|---|
| Record workout execution (match activity) | Any authenticated user (for self; `athleteId` from session) |
| Calculate compliance | Internal job / system actor (no user-facing route requires explicit authorization beyond auth) |
| List executions for an assignment | Authenticated; `workoutAssignmentId` scoped — caller must know the ID |
| Coach evaluation (create/update) | Coach with active membership in the school that owns the assignment |
| List evaluations (coach view) | The coach who created them (`coachId = actor's coachProfile.id`) |
| List evaluations (athlete view) | Athlete who owns the execution (`athleteId = session.user.id`); filtered to `isVisible = true` |
| Submit athlete feedback | The athlete (`athleteId = session.user.id`) |

---

## 7. History access grants

| Action | Who |
|---|---|
| Grant history access to coach | Athlete (self only) |
| Grant history access to school | Athlete (self only) |
| Revoke grant | Athlete (self only) |
| Read history under grant | Grantee (coach or school member) validated by `CanReadAthleteHistory` |

`CanReadAthleteHistory` verifies:
- A non-revoked, non-expired `HistoryAccessGrant` exists for the (granteeType, granteeId, athleteId) triple
- The requested scope categories are all covered by the grant's `scope` field

---

## 8. Audit logs

| Action | Who |
|---|---|
| Read school audit log | OWNER or ADMIN (via `CanManageSchool`) |
| Write audit record | Server-side only; no client route for creation |

---

## 9. Cross-cutting rules

| Rule | Enforcement point |
|---|---|
| Actors can only modify their own school memberships (join/leave) | Route + domain: `actorUserId` binds to session |
| School ID is always validated against the DB before any mutation | Use cases perform `school.findUnique` and check `status = ACTIVE` |
| Role changes require OWNER | `SchoolMembershipRole` mutations check OWNER level |
| Temporal gaps in membership history are prohibited | Domain enforces `endedAt = null` for active records; `startedAt` set on activation |
| No cross-school data access | Every query that reads another school's data must go through a membership check for that school |
| `CanDeactivateSchool` requires OWNER (not ADMIN) | Stricter than normal management; prevents ADMIN self-promotion attacks |

---

## 10. Non-negotiable invariants

- **`athleteId` is always `User.id`** — there is no separate AthleteProfile table.
- **School roles are scoped** — `OWNER`/`ADMIN` at one school grant no rights at another.
- **History consent belongs to the athlete** — no admin can grant history access on behalf of an athlete.
- **Invitation token is a bearer credential** — knowledge of the token is sufficient to accept; expiry and revocation are the revocation mechanism.
- **Deactivation cascades** — all `ACTIVE` memberships, assignments, and pending coach assignments are ended atomically within a serializable transaction.
