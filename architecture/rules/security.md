# Security rules

- Never log secrets, tokens, passwords, authorization headers, or webhook secrets.
- Avoid logging PII unless the flow explicitly requires it.
- Validate webhook requests before processing them.
- Protect admin surfaces with explicit authorization checks.
- Keep secrets in env or vaults, not in docs or examples.
- Validate environment variables before relying on them.
- Treat external docs as the source of truth for external contracts.

## Impact reminders

- Security changes can affect auth, integrations, WhatsApp, and jobs.
- Rate limits and secret handling often span server, routes, and provider modules.

## Test reminder

- Prefer focused tests around guards, webhook validation, and token handling.