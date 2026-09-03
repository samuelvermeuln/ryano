# Reports rules

- Report sections are capability-driven.
- Report generation rules should be shared between preview and real delivery when possible.
- Delivery must be idempotent.
- Delivery must be auditable.
- Transport concerns must not redefine report business rules.
- Queue or dispatch logic should not become the source of truth for report content.

## Impact reminders

- Report changes can affect dashboard, activities, WhatsApp, and admin preview flows.
- Capability gating may remove or add sections without changing the contract of the page.

## Test reminder

- Validate the report template tests and the closest delivery tests.