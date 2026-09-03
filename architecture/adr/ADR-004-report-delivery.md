# ADR-004 — Report delivery

## Status

Accepted

## Context

Ryvano reports can be previewed and delivered through operational transports such as WhatsApp. The content rules must remain stable across both paths.

## Decision

Keep report construction separate from transport, and make delivery idempotent and auditable.

## Consequences

- Preview and real delivery can share the same business rules.
- Transport-specific concerns stay out of the report contract.
- Operational retries should not create duplicate user-visible results.

## Rules for future changes

- Do not make a transport redefine report content.
- Keep preview behavior aligned with delivery behavior whenever possible.