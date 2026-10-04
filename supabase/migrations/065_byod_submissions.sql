-- 065 — Bring Your Own Deal submissions (V8 SA Founding Beta), user-owned.
--
-- STATUS: PREPARED, NOT APPLIED ANYWHERE. Additive only — creates ONE new table,
-- edits nothing migrations 001–064 created. Rehearsed locally (PGlite) only. Do NOT
-- apply to Supabase validation or Production without separate human approval.
-- Production and the live V6D beta are untouched by this file.
--
-- WHAT: public.byod_submissions stores the facts a founding-beta customer MANUALLY
-- ENTERS about a property they found elsewhere, so a saved "Bring Your Own Deal" can
-- be reconstructed for the pipeline + one-page brief. The source URL is REFERENCE
-- ONLY (never fetched/scraped) and is kept, with a capture timestamp, purely as
-- provenance. Every fact here is user-supplied and is labelled origin=user in the app.
--
-- SECURITY MODEL (matches 059/061/063): anon/PUBLIC get no access; authenticated is
-- gated to its own rows by (select auth.uid()) = user_id.

create table if not exists public.byod_submissions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,

  -- Provenance for the user-entered facts (URL is reference-only, never fetched).
  source_url         text,
  source_captured_at timestamptz,

  -- User-entered listing facts.
  address_full       text not null,
  suburb             text not null,
  state              text not null check (state in ('SA','VIC','NSW','QLD','WA','TAS','ACT','NT')),
  postcode           text,
  geography_id       text not null,
  property_type      text not null check (property_type in ('house','unit','townhouse','land','other')),
  bedrooms           smallint check (bedrooms  is null or (bedrooms  between 0 and 20)),
  bathrooms          smallint check (bathrooms is null or (bathrooms between 0 and 20)),
  parking            smallint check (parking   is null or (parking   between 0 and 20)),
  land_area_sqm      numeric  check (land_area_sqm is null or land_area_sqm > 0),
  price_display      text not null check (price_display in ('exact','range','offers_over','contact_agent','undisclosed')),
  price_lower        numeric  check (price_lower is null or price_lower > 0),
  price_upper        numeric  check (price_upper is null or price_upper > 0),
  listing_status     text not null check (listing_status in ('for_sale','under_offer','sold','withdrawn')),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.byod_submissions enable row level security;

drop policy if exists "byod_select_own" on public.byod_submissions;
create policy "byod_select_own" on public.byod_submissions for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "byod_insert_own" on public.byod_submissions;
create policy "byod_insert_own" on public.byod_submissions for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "byod_update_own" on public.byod_submissions;
create policy "byod_update_own" on public.byod_submissions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "byod_delete_own" on public.byod_submissions;
create policy "byod_delete_own" on public.byod_submissions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Least-privilege grants (matches 061/063): no anon/PUBLIC access.
revoke all on public.byod_submissions from anon, public;
grant select, insert, update, delete on public.byod_submissions to authenticated;

comment on table public.byod_submissions is
  'V8 Bring Your Own Deal: user-ENTERED (never scraped) listing facts, RLS-scoped to the owner. source_url is reference-only provenance. Facts are labelled origin=user in the app; official market evidence and Propellect estimates remain separately labelled.';
