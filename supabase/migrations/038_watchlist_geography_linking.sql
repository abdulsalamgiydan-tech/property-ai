-- ============================================================
-- Sprint 13 Phase 1, Workstream 8a — link watchlist suburb entries to the
-- research warehouse's geography records.
--
-- Extends the existing watchlist_items table (already supports
-- type='suburb') rather than creating a parallel "saved geography" table
-- — the semantics already fit, they just needed a few more nullable
-- columns. Purely additive: no DROP/TRUNCATE/DELETE, no backfill of
-- existing free-text suburb/state rows (they remain valid as-is; only
-- new/edited rows populate the geography link). RLS is unchanged by a
-- column addition — no new policies required.
-- ============================================================

alter table public.watchlist_items
  add column if not exists geography_id   text,
  add column if not exists geography_code text,
  add column if not exists geography_type text,
  add column if not exists postcode       text,
  add column if not exists tags           text[] not null default '{}',
  add column if not exists updated_at     timestamptz not null default now();

drop trigger if exists set_watchlist_items_updated_at on public.watchlist_items;
create trigger set_watchlist_items_updated_at
  before update on public.watchlist_items
  for each row execute function public.set_updated_at();
