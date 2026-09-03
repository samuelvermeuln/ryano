# ADR-002 — Canonical activity normalization

## Status

Accepted

## Context

Provider payloads differ. The shared UI and reporting surfaces need a canonical representation that can survive provider changes.

## Decision

Normalize provider payloads into a shared activity model before they reach shared UI, reports, or cross-provider logic.

## Consequences

- Provider-specific parsing stays inside provider modules.
- The raw provider value can still be preserved for audit or later correction.
- Changes to sport taxonomy can have a broad blast radius.

## Rules for future changes

- Do not consume raw provider DTOs directly in shared UI.
- Do not silently change the meaning of existing canonical sport values.