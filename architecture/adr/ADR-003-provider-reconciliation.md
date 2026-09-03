# ADR-003 — Provider reconciliation

## Status

Accepted

## Context

A single user may have multiple providers, and the same activity can appear in more than one system. Reconciliation must not erase differences by default.

## Decision

Treat reconciliation as an explicit, policy-gated operation. Do not auto-merge conflicting records silently.

## Consequences

- Differences between providers remain visible when needed.
- Reconciliation can be enabled only when policy allows it.
- Auditability and data lineage remain important.

## Rules for future changes

- Do not make reconciliation automatic.
- Preserve source-of-truth information whenever records are combined or compared.