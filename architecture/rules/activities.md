# Activities rules

- Normalize provider data before shared UI or report consumption.
- Use the canonical `RyvanoSportType` taxonomy when the code confirms it.
- Keep raw provider sport values available when the business flow needs them.
- A change in sport taxonomy must be treated as a blast-radius event.
- Reconciliation between providers must be explicit.
- Conflicting records must not be silently merged.
- Differences between Garmin and Strava may need to be preserved for auditability.

## Impact reminders

- Sport changes can affect parsers, presentation, dashboard, reports, WhatsApp content, and tests.
- Activity-detail enrichment may depend on provider-specific capabilities.

## Test reminder

- Validate parser and presentation tests close to the affected area.