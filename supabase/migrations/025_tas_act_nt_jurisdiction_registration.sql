-- ============================================================
-- Propellect — Register TAS/ACT/NT in meta.jurisdiction (Sprint 12, Workstream 2)
--
-- Purely additive metadata. meta.jurisdiction only had NSW/VIC/QLD/SA/WA
-- registered (confirmed by Sprint 12 Workstream 1's live audit,
-- warehouse/reports/national_coverage_audit.md) despite all 8 Australian
-- jurisdictions already having their ASGS geography backbone loaded
-- nationally since Sprints 2-4. This migration closes that specific gap
-- so every jurisdiction referenced anywhere (map markers, coverage
-- registry, future adapters) resolves to a real meta.jurisdiction row
-- instead of a NULL jurisdiction label.
--
-- status='national_context_only' matches the vocabulary already
-- established in warehouse/config/jurisdiction_coverage.yml's
-- onboard_status field for these three jurisdictions: ASGS geography,
-- Census demographics/dwelling-stock/tenure, Building Approvals and RBA
-- rates are available (loaded nationally), but no market data (sales or
-- rent) is loaded yet — Workstream 2 is actively investigating sources.
-- ============================================================

insert into meta.jurisdiction (jurisdiction_code, asgs_state_code, display_name, status, since_sprint)
values
  ('TAS', '6', 'Tasmania', 'national_context_only', 12),
  ('NT', '7', 'Northern Territory', 'national_context_only', 12),
  ('ACT', '8', 'Australian Capital Territory', 'national_context_only', 12)
on conflict (jurisdiction_code) do nothing;
