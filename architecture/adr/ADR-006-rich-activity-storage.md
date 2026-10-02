# ADR-006 — Rich activity storage

## Status

Accepted (SAM-38, 2026-10-02)

## Context

`Activity` stored only aggregates; laps lived in provider-shaped JSON (`metrics.stravaActivityDetails.laps`, `metrics.garminActivityDetails`), zones were recomputed on read and time series were never persisted. The shared activity view (athlete, coach, school — SAM-34/37/40) needs laps, time in zone, series for charts and the route, in a shape that does not depend on which provider recorded the session (ADR-005).

## Decision

1. **Canonical tables, additive migration (`0057`).** `ActivityLap` (one row per lap), `ActivityZone` (one row per zone of a zone set: HR / power / pace) and `ActivityStream` (one row per series) mirror the DTOs of `modules/shared/activities/contracts/rich.ts`. Every row carries `sourceProvider` and `sourceKind` (`NATIVE | DERIVED`); derived zones also carry `configurationRef` (the technical-sheet revision they were computed from).
2. **Series are stored columnar.** One `ActivityStream` row per key with the samples as a JSON array aligned with the `TIME` series; `null` is a gap, never `0`. A two-hour ride at 1 Hz is ~7 200 samples × 10 series: tens of kilobytes per activity, not 72 000 rows. Reading a chart is one query per activity.
3. **Extended stats are columns on `Activity`,** all nullable, named generically (`energyImpact` + `energyLabel`, `trainingLoad`, `aerobicEffect` + label…) so Polar, COROS, Suunto, Fitbit or Amazfit fit without a new migration. `duplicateOfActivityId` marks the same session recorded by a second connection (SAM-45); `detailSyncedAt` tells the ingestion (SAM-39) what still needs backfilling.
4. **Self-assessment of an unplanned activity reuses `AthleteFeedback`** (RPE, mood, energy, comment): it is anchored to exactly one of a matched execution or an `Activity` (CHECK constraint). No parallel `ActivityPerception` table.
5. **Readers prefer the tables and fall back to the legacy JSON** until the backfill has run; the JSON blocks become compatibility data, never the source of a new feature.

## Consequences

- No screen changes in SAM-38 itself; SAM-39 fills the tables, SAM-40 reads them.
- Retention of streams follows the provider policies (`maxCacheAgeSeconds`, `purge-expired-streams`), to be aligned in SAM-39.
- Rollback is a drop of the three tables, the enums and the new columns (documented in the migration file and in `architecture/escola-migration-checklist.md`).

## Rules for future changes

- Never store a provider-specific column name; add a generic one with a label.
- Never store `0` for a value the provider did not send.
- Never write a sample-per-row model for streams.
