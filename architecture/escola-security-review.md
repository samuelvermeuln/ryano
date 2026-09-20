# Escola Module — Security Review (T317–T319)

## T317 — Revisão de segurança geral

| Area | Verdict | Evidence |
|---|---|---|
| Authentication | ✅ | Every route calls `auth()` before any data access; `requireOnboardedSession` redirects unauthenticated requests |
| Authorization | ✅ | Role checks performed after session validation on every sensitive route; school membership verified per-request (no trust of URL params) |
| Input validation | ✅ | All use-case inputs parsed with Zod `strictObject`; API routes parse query params before forwarding to use cases |
| Prisma injection | ✅ | No raw SQL; all queries use typed Prisma client; `@db.VarChar` caps on string columns |
| Error leakage | ✅ | `SchoolError.code` + `SchoolError.message` exposed; stack traces never serialized to responses |
| Audit trail | ✅ | `SchoolAuditLog` append-only table instruments all mutations; `logIntegrationEvent` for observability |
| Rate limiting | ⚠️ | No per-route rate limiting yet; recommended before public launch |
| CSRF | ✅ | Server Actions use Next.js built-in CSRF protection; API routes are JSON-only |
| Secrets | ✅ | Tokens never logged; audit hooks explicitly exclude token fields; `SchoolAuditLog.metadata` JSON does not include credentials |
| School isolation | ✅ | `schoolId` always verified against the authenticated actor's membership; cross-school reads blocked |

## T318 — Revisão de exposição de histórico

`HistoryAccessGrant` controls what data a coach or school can read:

- **Consent belongs to the athlete** — `GrantHistoryAccess.execute` uses `actorUserId` as `athleteId`; no admin can grant on behalf of an athlete.
- **Scope is explicit** — `historyGrantScopeSchema` requires every category (`activities`, `metrics`, `prescribedWorkouts`, `compliance`, `coachScores`, `coachComments`, `assessments`, `athleteFeedback`) to be stated explicitly; omission is never treated as consent.
- **Period bounds are enforced** — `fromDate`/`toDate` are UTC calendar dates; the `calendarDate` Zod refinement ensures midnight-only timestamps.
- **Revocation is permanent** — `RevokeHistoryAccess` sets `revokedAt` + `status=REVOKED`; no re-activation path exists.
- **`can-read-athlete-history.ts`** is the single read gate; all queries that expose historical data must route through it.
- **Residual risk**: if a grant is created with `toDate=null` it never expires. The UI warns about this; enforcement of maximum grant windows is a future policy gate.

## T319 — Revisão de tokens de convite

| Property | Implementation | File |
|---|---|---|
| Entropy | 256 bits (`randomBytes(32)`) | `server/utils/token.ts` |
| Storage | SHA-256 of the raw token; raw token never persisted | `invitation-token.ts` |
| Comparison | `timingSafeEqual` via `safeEqualHash` | `server/utils/token.ts` |
| Transport | Token in URL path; HTTPS enforced in production | `app/entrar/convite/[token]/page.tsx` |
| Expiry | Optional `expiresAt`; checked server-side in `ResolveInvitationLink` | `resolve-invitation-link.ts` |
| Max-uses | `usedCount < maxUses` enforced inside a serializable transaction | `accept-invitation.ts` |
| Revocation | `status=REVOKED` + `revokedAt` set atomically | `revoke-invitation.ts` |
| Log safety | `tokenHash` may appear in logs; raw token must never appear — enforced by the issuance contract in `generateInvitationToken` | `invitation-token.ts` |

**No issues found.** The token implementation follows OWASP secure token guidance.
