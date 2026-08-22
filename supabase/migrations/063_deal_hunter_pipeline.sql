-- 063 — Deal Hunter pipeline + feedback (V7B), user-owned tables.
--
-- STATUS: PREPARED, NOT APPLIED REMOTELY. Additive only — creates new objects,
-- edits nothing migrations 001–062 created. Rehearsed locally (PGlite) only.
-- Do NOT apply to Supabase validation or Production without separate human
-- approval. Production and the live V6D beta are untouched by this file.
--
-- WHAT:
--   public.deal_pipeline_items  — a user's per-listing acquisition pipeline
--     (New → Reviewing → Due diligence → Rejected → Offer considered), RLS-scoped.
--   public.deal_listing_feedback — append-only explicit signals (saved/passed/
--     rejected+reason/compared/brief_opened/dd_status) used to PROPOSE transparent
--     preference adjustments; rows are an honest, unaltered record.
--
-- DELIBERATELY NOT HERE: canonical listing storage and per-user LISTING change
-- events are NOT persisted in this alpha. Listings run through the labelled replay
-- provider and the ranked feed + events are computed on the fly, so there is no
-- forgeable listing-event table. When live provider ingestion exists, listing
-- persistence + a SECURITY DEFINER event detector (like 062) would be a separate,
-- separately-approved migration. We do NOT overload V7A's suburb-change tables with
-- property-listing semantics.
--
-- SECURITY MODEL (matches 059/061/062): anon/PUBLIC get no access; authenticated is
-- gated to its own rows by (select auth.uid()) = user_id.

-- ---------------------------------------------------------------------------
-- 1) Per-user deal pipeline (New → … → Offer considered).
-- ---------------------------------------------------------------------------
create table if not exists public.deal_pipeline_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  listing_key      text not null,               -- provider:providerListingId
  status           text not null default 'new'
                     check (status in ('new','reviewing','due_diligence','rejected','offer_considered')),
  -- Required when status = 'rejected' (enforced at the app layer + this check).
  rejection_reason text
                     check (rejection_reason is null or rejection_reason in
                       ('too_expensive','poor_cashflow','wrong_location','too_small','condition_or_risk','low_confidence','other')),
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, listing_key),
  -- A rejected item must carry a reason (DB-enforced belt-and-braces).
  constraint deal_pipeline_rejected_needs_reason
    check (status <> 'rejected' or rejection_reason is not null)
);
alter table public.deal_pipeline_items enable row level security;

drop policy if exists "pipeline_select_own" on public.deal_pipeline_items;
create policy "pipeline_select_own" on public.deal_pipeline_items for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "pipeline_insert_own" on public.deal_pipeline_items;
create policy "pipeline_insert_own" on public.deal_pipeline_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "pipeline_update_own" on public.deal_pipeline_items;
create policy "pipeline_update_own" on public.deal_pipeline_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "pipeline_delete_own" on public.deal_pipeline_items;
create policy "pipeline_delete_own" on public.deal_pipeline_items for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.deal_pipeline_items is
  'Per-user Deal Hunter pipeline (V7B). RLS scopes rows to their owner. A rejected item must carry a rejection_reason (DB check). listing_key references a provider listing (provider:id); canonical listings are not persisted in the alpha.';

-- ---------------------------------------------------------------------------
-- 2) Append-only feedback signals (drive TRANSPARENT preference proposals only).
-- ---------------------------------------------------------------------------
create table if not exists public.deal_listing_feedback (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  listing_key   text not null,
  kind          text not null check (kind in ('saved','passed','rejected','compared','brief_opened','dd_status')),
  reason        text check (reason is null or reason in
                  ('too_expensive','poor_cashflow','wrong_location','too_small','condition_or_risk','low_confidence','other')),
  created_at    timestamptz not null default now()
);
alter table public.deal_listing_feedback enable row level security;

-- Append-only: users may read + insert their own signals; never update/delete
-- (an honest, unaltered record — same shape as strategy_generations / user_feedback).
drop policy if exists "feedback_select_own" on public.deal_listing_feedback;
create policy "feedback_select_own" on public.deal_listing_feedback for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "feedback_insert_own" on public.deal_listing_feedback;
create policy "feedback_insert_own" on public.deal_listing_feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);

comment on table public.deal_listing_feedback is
  'Append-only V7B feedback signals. Used only to PROPOSE transparent preference adjustments (no silent re-ranking, no opaque ML). Read + insert own rows; deliberately no update/delete policy.';

-- ---------------------------------------------------------------------------
-- 3) Grants (least-privilege, matches 061/062).
-- ---------------------------------------------------------------------------
revoke all on public.deal_pipeline_items   from anon, public;
revoke all on public.deal_listing_feedback from anon, public;
grant select, insert, update, delete on public.deal_pipeline_items to authenticated;
grant select, insert on public.deal_listing_feedback to authenticated; -- append-only
