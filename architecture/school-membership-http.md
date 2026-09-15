# School sport membership HTTP contract (T058)

All endpoints require a session and SCHOOL_MODULE_ENABLED. The actor always comes from the session. Mutation bodies are empty or `{}`; other fields are rejected.

- `GET /api/schools/:id/coaches` and `/athletes`: management-only temporal membership lists, with `limit` (1–100, default 20) and opaque `cursor`; response `{ items, nextCursor }`.
- `POST /api/schools/:id/coaches` and `/athletes`: request a new pending membership for the authenticated coach/athlete; return 201.
- `POST /api/schools/:id/athletes/rejoin`: request a new pending athlete period; never reopen a previous period; return 201.
- `POST /api/schools/:id/coaches/:membershipId/approve` and `/reject`, likewise for `/athletes`: delegate the existing decision use cases.
- `DELETE /api/schools/:id/coaches/:membershipId` and `/athletes/:membershipId`: end the identified temporal membership; never physically delete it.

The conceptual design's coachId/athleteId action segment is resolved here as membershipId: clients pass the period's `items[].id`, not the participant identity. This prevents a delayed decision from silently targeting a later period. The existing use cases enforce school scope, permissions and transitions. Invitation links remain owned by the invitation phase.

Validation status: waived by the user's environment instruction. Route and list tests were created but not executed; lint, TypeScript, runtime checks, review and post-change graph analysis were not run.
