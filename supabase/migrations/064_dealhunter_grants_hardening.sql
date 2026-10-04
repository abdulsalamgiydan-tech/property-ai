-- 064 — Defense-in-depth grant hardening for the V7A/V7B user tables + detector.
--
-- STATUS: PREPARED. Applied to the deal-hunter-preview branch (mmqxwwjshnpcqngciqtx)
-- during V7C-B; NOT applied to Production. Additive/forward security migration.
-- Do NOT apply to Production without separate human approval.
--
-- WHY (found on the live Supabase branch during V7C-B verification): Supabase's
-- default privileges grant the `authenticated` and `anon` roles broad table/function
-- access that migrations 062/063 did not explicitly revoke. This left, at the GRANT
-- level (not the RLS level):
--   * authenticated with INSERT on investment_shortlist_change_events (forgery surface)
--   * authenticated with UPDATE/DELETE on deal_listing_feedback (breaks append-only)
--   * anon with EXECUTE on detect_shortlist_change_events_v1 (should be authenticated-only)
-- RLS already blocks all of these in practice (proven: forge INSERT -> 42501; feedback
-- UPDATE/DELETE -> 0 rows; anon detector -> no-op with auth.uid() null). This migration
-- closes the gap at the GRANT level too — least-privilege / defense-in-depth, mirroring
-- what migration 061 did for 059/060. It changes no schema and no data.

-- 1) change events: definer-only writer -> authenticated must not hold INSERT.
revoke insert on public.investment_shortlist_change_events from authenticated, anon, public;
-- reassert the intended surface (idempotent).
grant select, update, delete on public.investment_shortlist_change_events to authenticated;

-- 2) feedback: append-only -> authenticated must not hold UPDATE/DELETE.
revoke update, delete on public.deal_listing_feedback from authenticated, anon, public;
grant select, insert on public.deal_listing_feedback to authenticated;

-- 3) detector: authenticated-only EXECUTE (anon is a no-op but should not be callable).
revoke execute on function public.detect_shortlist_change_events_v1() from anon, public;
grant execute on function public.detect_shortlist_change_events_v1() to authenticated;
