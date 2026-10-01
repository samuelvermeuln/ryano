# Escola Module — HTTP Endpoints (T361)

All routes are gated by `assertSchoolModuleEnabled()`. Unauthenticated requests return `401`.
Feature-disabled requests return `404`. See [permission rules](escola-permission-rules.md) for
role requirements per endpoint.

---

## Schools

### `POST /api/schools`
Create a school. Actor becomes OWNER.

**Body:** `{ name, slug?, description?, logoUrl? }`  
**Response 201:** `School`

### `GET /api/schools/search`
Public search for active schools by **name or city** (SAM-24).

**Query:** `?q=<text>&limit=<1-100>&cursor=<id>`  
**Response 200:** `{ items: SchoolSearchResult[], nextCursor: string | null }` — `id, slug, name, description, logoUrl, city, state, sportTypes, activeAthleteCount, joinPolicy, coachSelectionPolicy`. Never contact data or ownership.

### `GET /api/schools/[id]/profile`
Public profile of an ACTIVE school for the **signed-in** viewer (SAM-24): name, logo, description, `since`, sport types, address (no postal code), phone, e-mail, policies, active athlete count, responsible (OWNER name + image), active non-suspended coaches, and `viewer: { membershipStatus: NONE|PENDING|ACTIVE, requestedAt }`. Inactive or absent → `404`. Never the CNPJ, staff or other athletes.

### `GET /api/schools/[id]`
Get school details.

**Response 200:** `School`

### `PATCH /api/schools/[id]`
Update school details. Requires OWNER or ADMIN.

**Body:** partial school fields  
**Response 200:** `School`

### `POST /api/schools/[id]/deactivate`
Deactivate school and cascade-end all active memberships. Requires OWNER.

**Response 200:** void

### `POST /api/schools/[id]/reactivate`
Reactivate a deactivated school. Requires OWNER.

**Response 200:** void

---

## School Members

### `GET /api/schools/[id]/members`
List school members (OWNER/ADMIN only). Cursor-paginated.

**Query:** `?limit&cursor`  
**Response 200:** `{ items: SchoolMember[], nextCursor }`

### `POST /api/schools/[id]/members`
Add member directly. Requires OWNER or ADMIN.

**Body:** `{ userId, role }`  
**Response 201:** `SchoolMembership`

### `GET /api/schools/[id]/members/[membershipId]`
Get member details.

### `DELETE /api/schools/[id]/members/[membershipId]`
End membership.

### `GET /api/schools/[id]/members/[membershipId]/roles`
List roles for a membership.

### `PUT /api/schools/[id]/members/[membershipId]/roles/[role]`
Grant role. Requires OWNER.

### `DELETE /api/schools/[id]/members/[membershipId]/roles/[role]`
Revoke role. Requires OWNER.

---

## Athletes

### `GET /api/schools/[id]/athletes`
List athlete memberships. Requires OWNER or ADMIN.

**Query:** `?limit&cursor`  
**Response 200:** `{ items: SchoolAthleteMembership[], nextCursor }`

### `POST /api/schools/[id]/athletes`
Request school membership (self-serve). Body is optional (SAM-24):

**Body:** `{ shareHistory?: boolean (default true), preferredCoachId?: string | null }`  
- `shareHistory` creates a full-scope `HistoryAccessGrant` (SCHOOL) in the same transaction — the athlete's own consent (ADR-005).  
- `preferredCoachId` must be an ACTIVE, non-suspended coach of the school; creates a PENDING primary `CoachAthleteAssignment` the school decides on approval.  
**Response 201:** `SchoolAthleteMembership`  
**409:** `SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_PENDING`, `SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_ACTIVE`, `SCHOOL_INVITE_ONLY`, `COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE`, `COACH_SCHOOL_MEMBERSHIP_SUSPENDED`, `COACH_ATHLETE_ASSIGNMENT_CONFLICT`

Rejecting the request (`…/reject`) revokes the SCHOOL grant and rejects the PENDING assignment created with it, in one transaction.

### `POST /api/schools/[id]/athletes/rejoin`
Re-request membership after a previous ENDED membership.

### `GET /api/schools/[id]/athletes/[membershipId]`
Get athlete membership details.

### `POST /api/schools/[id]/athletes/[membershipId]/approve`
Approve pending athlete. Requires OWNER or ADMIN.

**Response 200:** `SchoolAthleteMembership`

### `POST /api/schools/[id]/athletes/[membershipId]/reject`
Reject pending athlete. Requires OWNER or ADMIN.

**Response 200:** `SchoolAthleteMembership`

### `GET /api/schools/[id]/lobby`
List pending athlete memberships. Requires OWNER or ADMIN.

---

## Coaches — athlete discovery (SAM-25)

### `GET /api/coaches/search`
Signed-in search of ACTIVE coaches by display name (contains) or exact account e-mail (case-insensitive).

**Query:** `?q=<text>&limit=<1-100>`  
**Response 200:** `{ items: CoachSearchResult[] }` — `id, displayName, bio, image, schools[{id,name}], activeAthleteCount`. The e-mail is a lookup key only; contact data is never returned.

### `GET /api/coaches/[coachId]/profile`
Public profile of an ACTIVE coach for the signed-in viewer: `displayName, bio, image, since, schools[{id,name,city,state}] (ACTIVE, not suspended), activeAthleteCount, viewer: { assignments[{id,schoolId,status,requestedAt}], sharedSchoolIds, isSelf }`. Absent/inactive → `404`.

### `POST /api/coaches/[coachId]/athlete-requests`
Athlete asks the coach to follow them. Body optional:

**Body:** `{ schoolId?: string | null, shareHistory?: boolean (default true), note?: string (≤500) }`  
- `schoolId` null → independent coaching; refused if the pair already has a PENDING/ACTIVE link.  
- `schoolId` set → athlete ACTIVE at the school, coach ACTIVE and not suspended there, no open primary coach for the athlete at that school; audited as `coach_assignment.requested`.  
- Creates a PENDING primary `CoachAthleteAssignment` (`reason = note`) and, with `shareHistory`, a full-scope `HistoryAccessGrant` (COACH) in the same transaction.  
**Response 201:** `CoachAthleteAssignment`  
**409:** `COACH_ATHLETE_ASSIGNMENT_CONFLICT`, `COACH_ATHLETE_ASSIGNMENT_SELF`, `COACH_INACTIVE`, `COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE`, `COACH_SCHOOL_MEMBERSHIP_SUSPENDED` · **403:** `ATHLETE_NOT_MEMBER`

### `DELETE /api/coaches/[coachId]/athlete-requests/[assignmentId]`
Athlete withdraws their own PENDING request. Closes it as REJECTED (actor = athlete) and revokes the COACH grant unless another open link with the same coach still exists. Someone else's request → `404`; already decided → `409`.

## Coaches

### `GET /api/schools/[id]/coaches`
List coach memberships. Requires OWNER or ADMIN.

### `POST /api/schools/[id]/coaches/[membershipId]/approve`
Approve pending coach.

### `POST /api/schools/[id]/coaches/[membershipId]/reject`
Reject pending coach.

### `POST /api/schools/[id]/coach-assignments/bulk`
Assign / reassign coaches to multiple athletes. Requires OWNER or ADMIN.

---

## Invitations

### `POST /api/invitations`
Create invitation link. Requires OWNER or ADMIN for school invites.

**Body:** `{ type, schoolId?, coachId?, requiresApproval?, expiresAt?, maxUses? }`  
**Response 201:** `{ invitation: InvitationLink, token: string }`  
⚠️ `token` is returned once and never stored in plain-text.

### `GET /api/invitations/[id]`
Get invitation metadata (no token).

### `POST /api/invitations/[id]/revoke`
Revoke an invitation. Requires OWNER or ADMIN.

### `POST /api/invitations/[id]/accept`
Accept an invitation. Actor becomes the subject of the membership or assignment.

**Body:** `{ token: string }`  
**Response 200:** `InvitationUse`

---

## Audit Log

### `GET /api/schools/[id]/audit-logs`
Paginated audit log for the school. Requires OWNER or ADMIN.

**Query:** `?entityType&entityId&limit&before`  
**Response 200:** `{ items: SchoolAuditLog[], nextCursor }`

---

## Workout Assignments

### `GET /api/workout-assignments`
List workout assignments visible to the caller.  
Athletes see only their own. Coaches specifying another `athleteId` must also provide `schoolId` and hold an active membership.

**Query:** `?schoolId&athleteId&status&limit&cursor`  
**Response 200:** `{ data: WorkoutAssignment[], nextCursor }`

### `GET /api/workout-assignments/[id]/executions`
List executions for an assignment. Cursor-paginated.

**Query:** `?limit&cursor`  
**Response 200:** `{ items: WorkoutExecution[], nextCursor }`

### `POST /api/workout-assignments/[id]/executions`
Manually match an activity to a workout assignment.

**Body:** `matchActivityToWorkoutSchema` fields  
**Response 201:** `WorkoutExecution`

---

## Athlete Workouts

### `GET /api/athletes/[athleteId]/workouts`
List workout assignments for an athlete. Only accessible by the athlete themselves.

**Query:** `?cursor&limit`  
**Response 200:** `{ items, nextCursor }`

---

## Workout Executions

### `GET /api/workout-executions/[id]/evaluation`
List evaluations for a workout execution.  
- Athletes see only `isVisible = true` evaluations.  
- Coaches see only their own evaluations.  
- Others receive `[]`.

### `POST /api/workout-executions/[id]/evaluation`
Create a coach evaluation. Requires active coach membership in the assignment's school.

**Body:** `{ schoolId, overallScore, note?, isVisible? }`  
**Response 201:** `CoachEvaluation`

### `PATCH /api/workout-executions/[id]/evaluation`
Update a coach evaluation (own evaluations only).

---

## History Access Grants

### `POST /api/history-grants` *(or via school/athlete routes)*
Grant history access to a coach or school. Athlete only (self).

### `DELETE /api/history-grants/[id]`
Revoke a history access grant. Athlete only (self).

---

## Common error responses

```json
{ "code": "ERROR_CODE", "message": "Human-readable message" }
{ "code": "VALIDATION_ERROR", "message": "Dados inválidos.", "details": [...] }
{ "code": "SCHOOL_MODULE_DISABLED", "message": "Recurso indisponível." }
{ "code": "INTERNAL_ERROR", "message": "Não foi possível concluir a operação." }
```

HTTP status codes follow the convention in `escola-permission-rules.md §1`.
