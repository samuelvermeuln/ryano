# API rules

- Route handlers should stay thin.
- Validate request shape at the boundary.
- Delegate business rules to the application or module layer.
- Keep auth checks explicit.
- Preserve idempotency where the route can be retried.
- Return stable error shapes for operational routes.
- Prefer a single contract boundary rather than mixing HTTP concerns with business logic.

## Impact reminders

- API changes can affect UI pages, jobs, admin tools, and tests.
- Changing one route may require checking its consumers and any scheduled job that calls it.

## Test reminder

- Validate route tests, request validation, and any downstream module tests that consume the route.