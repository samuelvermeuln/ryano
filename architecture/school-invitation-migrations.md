# Invitation links — T081

`0017_invitation_links` adds Prisma `InvitationLink` (the logical `invitation_links` table from the spec), `InvitationType` and `InvitationStatus`. It uses the existing PascalCase table/camelCase column naming, opaque String/cuid IDs, and UTC `timestamptz(3)` convention. No existing rows or migrations are modified.

- Only a nonempty unique `tokenHash` is stored. Token generation/hashing belongs to T084; no hash algorithm is fixed by this migration.
- SCHOOL requires only a school; SCHOOL_COACH requires school and coach; COACH requires only a coach. The latter is independent coaching. Coach membership/actor authorization is checked by later application use cases, not inferred from the FK.
- School, CoachProfile and creator User FKs use RESTRICT, preserving invitation history when an origin is inactive. Revocation is a status/timestamp update, never normal deletion.
- `requiresApproval` is required with no implicit default. New rows default to ACTIVE and zero uses. Null expiry/limit means no expiry/unlimited uses. Positive limits and nonnegative counters prevent overspending; EXHAUSTED requires reaching the limit; REVOKED pairs with `revokedAt`; EXPIRED requires `expiresAt`.
- Expiration is clock-dependent and must be enforced during resolution/acceptance even before a job changes status. SQL deliberately does not use `now()` in CHECKs. Accept must atomically guard status, expiry and remaining uses and record resulting changes/audit in a transaction; this migration alone does not implement acceptance, idempotency or a scheduler.
- Unique hash supports resolution; school/status and coach/status support scoped lists/revocation; creator supports provenance/FK lookup; status/expiry supports expiration jobs. No duplicate uniqueness index is added for active invitations: multiple links per scope are allowed.

## Invitation-use audit — T082

`0018_invitation_uses` adds `InvitationUse` and `InvitationUseResult` (`PENDING_APPROVAL`, `JOINED`, `REJECTED`, `FAILED`). It follows the same opaque IDs and `timestamptz(3)` convention. Each row records its invitation, authenticated actor, optional athlete (`User.id`), timestamp and explicit outcome. Actor and athlete use distinct named relations; the schema does not infer delegated authority from either FK.

All three FKs use RESTRICT so deleting the invitation, actor or athlete cannot silently erase audit history. Indexes by invitation/actor/athlete plus `usedAt,id` support stable chronological audit queries and FK lookups. The primary key uniquely identifies each event; there is intentionally no lifetime unique constraint on invitation/actor/athlete, because failures, retries with distinct outcomes and later re-entry must remain auditable (requirements section 74).

This is the audit storage foundation only. T087/T098 must atomically guard invitation capacity and active-membership duplication, implement command retry idempotency, and commit successful usage, counter changes and membership together. Audit row count is not automatically equal to `usedCount`: failed/rejected events do not grant membership or necessarily consume capacity. Normal application code appends audit records and does not hard-delete them; no trigger or table privilege change is introduced.

### Invitation-use deferred proof

`tests/invitation-use-persistence.test.ts` covers all outcomes, nullable athlete, separate actor/athlete, repeated history, primary-key collisions, invalid/dangling references, invalid results and retention after revocation. It is authored but unexecuted under the current waiver: Prisma generation/validation, database migration application, Vitest, TypeScript, ESLint and independent review are waived, not passed. Run it alongside the T081 persistence test against the isolated database after applying the full migration chain and regenerating the client.

## Rollout and rollback

Keep `SCHOOL_MODULE_ENABLED=false`. Apply the full additive migration chain with the installed Prisma `migrate deploy` only in an authorized target, then regenerate Prisma Client before building consumers. Confirm migration history/checksums and the new enum/table/FK/index/CHECK definitions. Do not edit previously applied SQL or replay migrations manually. Rollback disables the feature and reverts application code while retaining the table and history; there is no destructive down migration.

## Deferred proof

Per the current validation waiver, no Prisma generation/validation, PostgreSQL migration application, Vitest, TypeScript, ESLint or independent review was executed for T081. `tests/invitation-link-persistence.test.ts` is authored but unexecuted and requires the existing isolated `SCHOOL_TEST_DATABASE_URL` setup. Before deployment, apply the chain to that isolated database, regenerate the client, run that test, TypeScript and focused ESLint. These checks remain omitted, not passed.
