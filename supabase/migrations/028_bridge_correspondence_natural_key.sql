-- ============================================================
-- Propellect — Natural-key uniqueness on bridge_geography_correspondence (Sprint 12, Workstream 4)
--
-- The table only had a surrogate PK (correspondence_id, a random UUID) —
-- re-running any loader against it without this constraint would silently
-- create duplicate correspondence rows on a second run. Confirmed live
-- before adding: zero existing (source_geography_id, target_geography_id,
-- correspondence_version) duplicates, so this is safe to add now.
-- Required by this project's own validation standard ("duplicate natural
-- keys = 0" is an explicit blocking gate for Sprint 12 WS4).
-- ============================================================

alter table core.bridge_geography_correspondence
  add constraint bridge_geography_correspondence_natural_key
  unique (source_geography_id, target_geography_id, correspondence_version);
