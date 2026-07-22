-- ============================================================
-- Propellect — 2016-2021 boundary reconciliation: lineage columns (Sprint 12, Workstream 4)
--
-- Fixes the lineage defect Sprint 12 WS1's audit found: Sprint 11 WS4's
-- population_2016/population_growth_2016_2021_pct values share the SAME
-- row-level geography_method='direct'/confidence_label='official' fields
-- as the directly-published 2021 census figures, even though growth is a
-- derived, correspondence-weighted value. A single per-row field cannot
-- honestly describe two different provenance types in the same row.
--
-- Fix: dedicated lineage columns specifically for the growth metric,
-- separate from the row's general geography_method/confidence_label
-- (which continue to describe the direct 2021 figures, unchanged).
-- Purely additive — no existing column touched, no data loss.
--
-- Also extends core.bridge_geography_correspondence (which already had
-- almost every field this workstream needs: source/target geography
-- id+type, area/population/dwelling/preferred weight, method, version,
-- confidence_score, effective_from/to) with 3 more fields needed to
-- honestly represent a cross-EDITION (not just cross-level) correspondence:
-- the ABS quality label as published (not just a derived numeric score),
-- a per-source reconciliation residual, and the source dataset id.
-- ============================================================

alter table core.bridge_geography_correspondence
  add column if not exists quality_label text,
  add column if not exists reconciliation_residual_pct numeric,
  add column if not exists source_dataset_id text;

comment on column core.bridge_geography_correspondence.quality_label is
  'Raw ABS OVERALL_QUALITY_INDICATOR value (Good/Acceptable/Poor) as published — preserved verbatim, not collapsed into confidence_score alone, so a consumer can apply their own quality threshold.';
comment on column core.bridge_geography_correspondence.reconciliation_residual_pct is
  'For population-weighted correspondence: how much of the source geography''s total population is captured by this row''s ratio_from_to relative to the sum of ALL this source geography''s correspondence rows at Good/Acceptable quality. NULL where not computed (e.g. area/dwelling-only correspondences).';

alter table mart.suburb_demographic_profile_2021
  add column if not exists population_growth_method text,
  add column if not exists population_growth_confidence text,
  add column if not exists population_growth_correspondence_version text,
  add column if not exists population_growth_source_dataset_id text;

alter table mart.postcode_demographic_profile_2021
  add column if not exists population_growth_method text,
  add column if not exists population_growth_confidence text,
  add column if not exists population_growth_correspondence_version text,
  add column if not exists population_growth_source_dataset_id text;

comment on column mart.suburb_demographic_profile_2021.population_growth_method is
  'Provenance of population_growth_2016_2021_pct specifically — always ''derived'' (cross-boundary correspondence), independent of this row''s geography_method which describes the direct 2021 figures.';
comment on column mart.suburb_demographic_profile_2021.population_growth_confidence is
  'Confidence of the 2016-2021 growth figure specifically, derived from the ABS correspondence quality distribution that contributed to it — independent of this row''s confidence_label.';
comment on column mart.postcode_demographic_profile_2021.population_growth_method is
  'Provenance of population_growth_2016_2021_pct specifically — always ''derived'' (cross-boundary correspondence), independent of this row''s geography_method which describes the direct 2021 figures.';
comment on column mart.postcode_demographic_profile_2021.population_growth_confidence is
  'Confidence of the 2016-2021 growth figure specifically, derived from the ABS correspondence quality distribution that contributed to it — independent of this row''s confidence_label.';
