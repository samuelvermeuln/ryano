# Provider rules

- Users may have zero, one, or many connected providers.
- Garmin and Strava are current providers, not the center of the architecture.
- Future providers must fit through catalog + module + registry.
- Shared code should be provider-agnostic whenever capability checks are enough.
- Provider-specific protocol details belong inside the provider module.
- Capability checks are preferred over `if provider === ...` in shared code.
- Failure in one provider must not automatically break another.
- Shared rules must not assume every user has Garmin.
- Shared rules must not assume every user has Strava.
- External provider contracts require the current official documentation before changes.

## Impact reminders

- Auth and onboarding can affect provider connection surfaces.
- Provider availability can affect integration cards, routes, and admin views.
- Capability changes can affect dashboard, activities, and reports.

## Test reminder

- Use the closest repository tests for the changed surface, then widen the validation only if the change is cross-cutting.