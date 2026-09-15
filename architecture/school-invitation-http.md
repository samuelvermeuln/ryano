# Invitation HTTP contract (T090)

All endpoints require `SCHOOL_MODULE_ENABLED=true` and return `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`, including errors. Creation, acceptance and revocation require the server session. Preview is public to the bearer of the token.

| Method and path | Input | Success |
| --- | --- | --- |
| `POST /api/invitations` | JSON `CreateInvitationLink` DTO: type, optional schoolId/coachId, requiresApproval, expiresAt, maxUses | 201 `{ invitation, token }`; raw token is issued once |
| `GET /api/invitations/:token` | Exact token in path | 200 safe invitation preview |
| `POST /api/invitations/:token/accept` | Empty body or `{}` | 200 acceptance receipt; replay follows use-case idempotency |
| `POST /api/invitations/:invitationId/revoke` | Empty body or `{}` | 200 revoked invitation |

The shared Next dynamic segment is named `[id]` because token routes and ID management share one path level. Its value is never normalized. No endpoint accepts an actor, athlete identity or management role from the client. Authorization, availability, hashing, capacity, membership transitions and transactions remain in T085–T088 use cases.

Errors use the existing school envelope: `{ code, message }`, plus safe validation details when applicable; 400 invalid input, 401 missing session, 403 forbidden, 404 absent/disabled, 409 domain conflict, 500 masked internal failure. Dates serialize as ISO 8601. Persistence hashes are never selected by use-case output contracts. Application handlers do not log credentials; infrastructure access logs must redact the token-bearing paths defined by this spec.

Focused checks to execute when validation resumes: `tests/school-invitation-routes.test.ts`, the four invitation use-case test files, existing school route tests (shared response-envelope regression), TypeScript and area ESLint. Execution remains waived in this implementation batch.
