# History grants HTTP (T111)

All endpoints require `SCHOOL_MODULE_ENABLED` and an authenticated session. Responses,
including errors, use `Cache-Control: private, no-store` and the existing school error envelope.

- `POST /api/history/grants`: strict `grantHistoryAccessSchema`, returns the created grant (201).
- `GET /api/history/grants`: only grants owned and granted by the session athlete, including revoked grants.
  Accepts `limit` (default 20, maximum 100) and `cursor` (last returned opaque grant ID).
  Returns `{ items, nextCursor }`, ordered by ascending ID; no totals.
- `PATCH /api/history/grants/:grantId`: changes scope and/or period, returning the grant (200).
  Recipient, athlete and grant ID cannot be overridden in the body.
- `DELETE /api/history/grants/:grantId`: empty body or `{}`, returns the revoked grant (200).
  Delegates idempotent soft revocation and ownership checks to `RevokeHistoryAccess`.

Dates in requests are UTC calendar dates (`YYYY-MM-DD`) or null for unbounded periods.
Responses serialize domain dates as ISO timestamps. Scope requires an explicit boolean for
each category. Authorization and consent lifecycle rules remain in the existing use cases.

`CheckHistoryAccess` remains internal: recipient identity requires server authorization before
consent lookup. These endpoints do not implement shared-history data queries (T110).

Created coverage: `tests/history-grant-routes.test.ts` and `tests/list-history-grants.test.ts`.
Execution, TypeScript, ESLint and reviewer validation are waived/unexecuted for this batch.
