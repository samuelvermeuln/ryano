-- SAM-16 — School.timezone: the IANA zone in which the school's calendar is
-- read and written. A coach typing "06:00" in the prescription form means
-- 06:00 in this zone; the row keeps the UTC instant, and every label on the
-- coach's and the athlete's screens is rendered back in this zone.
--
-- Purely additive: one defaulted column, no existing row changes. Safe to
-- apply on a live database; rollback is dropping the column.
--
-- Data note (deliberately NOT rewritten): before this migration the coach
-- prescription form stored the typed wall-clock time as if it were UTC
-- (`${datetime-local}:00.000Z`), so a "06:00" prescribed from Brasília is
-- stored as 06:00Z and will now display as 03:00. Those rows are historical
-- and are not silently shifted — an automatic +3h would be wrong for any
-- school outside America/Sao_Paulo and for rows created through the API with
-- a real UTC instant. Coaches can reschedule the few affected future
-- prescriptions from the agenda, which records the change in the history.
ALTER TABLE "School"
  ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo';
