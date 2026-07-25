-- ============================================================
-- Propellect — Update TAS/ACT/NT jurisdiction status to sales_only (Sprint 12, Workstream 2)
--
-- Migration 025 registered TAS/ACT/NT with status='national_context_only'
-- (no market data). This migration follows directly: Workstream 2 loaded
-- GCCSA-grain sales (median price + transfer count, ABS Total Value of
-- Dwellings) for all three jurisdictions — see
-- warehouse/scripts/sales/load_abs_tvd_to_branch.mjs and
-- warehouse/reports/abs_tvd_branch_load_report.json. Rent remains
-- unavailable (TAS: live-reconfirmed Cloudflare block at CBOS Tasmania;
-- ACT/NT: zero results on official open-data portals) — status
-- 'sales_only' reflects exactly this, matching QLD/SA/WA's existing
-- 'rent_only' status pattern (same vocabulary, opposite metric).
-- ============================================================

update meta.jurisdiction
set status = 'sales_only'
where jurisdiction_code in ('TAS', 'ACT', 'NT');
