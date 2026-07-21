-- ============================================================
-- Propellect — National Map Explorer marker RPC (Sprint 11, Workstream 11)
--
-- Same security model as migrations 014/016: SECURITY DEFINER function,
-- pinned search_path, row limit AND bounding-box validation enforced
-- INSIDE the function (not just documented), SELECT/EXECUTE granted to
-- anon/authenticated only, zero direct grants on core/mart/meta. No
-- unbounded public endpoint — every call requires a bounding box and is
-- capped at 1,500 rows regardless of how many geographies fall inside it.
--
-- Broader jurisdiction coverage than the existing snapshot/compare
-- interfaces: includes QLD/SA/WA suburb+postcode rent (loaded Sprint 11
-- Workstream 9) via mart.suburb_rent_quarterly/postcode_rent_quarterly,
-- not just the NSW/VIC wide snapshot tables — the map is the first
-- interface in this project to surface all 5 jurisdictions with loaded
-- data at once.
-- ============================================================

-- meta.jurisdiction only had NSW/VIC registered — add QLD/SA/WA (rent
-- loaded Sprint 11 WS9) so this map's jurisdiction label isn't NULL for
-- their markers. Purely additive metadata, matches the existing row shape.
insert into meta.jurisdiction (jurisdiction_code, asgs_state_code, display_name, status, since_sprint)
values
  ('QLD', '3', 'Queensland', 'rent_only', 11),
  ('SA', '4', 'South Australia', 'rent_only', 11),
  ('WA', '5', 'Western Australia', 'rent_only', 11)
on conflict (jurisdiction_code) do nothing;

create or replace function public.get_market_map_markers_v1(
  p_min_lat numeric,
  p_max_lat numeric,
  p_min_lon numeric,
  p_max_lon numeric,
  p_geography_type text default null,
  p_limit integer default 500
)
returns table (
  geography_id text,
  geography_type text,
  geography_code text,
  geography_name text,
  state_code text,
  jurisdiction text,
  centroid_lat numeric,
  centroid_lon numeric,
  median_sale_price_12m numeric,
  sales_confidence text,
  median_weekly_rent_latest numeric,
  rent_confidence text,
  has_full_snapshot boolean
)
language plpgsql
security definer
stable
set search_path = public, core, mart, meta
as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1500); -- clamp 1..1500
begin
  if p_min_lat is null or p_max_lat is null or p_min_lon is null or p_max_lon is null then
    raise exception 'bounding box (p_min_lat, p_max_lat, p_min_lon, p_max_lon) is required';
  end if;
  -- Australia's approximate bounding box, with a small margin — refuses
  -- wildly out-of-range input rather than silently returning nothing.
  if p_min_lat < -45 or p_max_lat > -8 or p_min_lon < 108 or p_max_lon > 156 then
    raise exception 'bounding box outside Australia''s valid range';
  end if;
  if p_min_lat >= p_max_lat or p_min_lon >= p_max_lon then
    raise exception 'invalid bounding box: min must be less than max';
  end if;
  if p_geography_type is not null and p_geography_type not in ('SAL', 'POA', 'LGA') then
    raise exception 'invalid geography_type: must be SAL, POA or LGA';
  end if;

  return query
  -- mart.suburb_market_snapshot/postcode_market_snapshot have a placeholder
  -- row for EVERY geography nationally (created when the geography backbone
  -- was first loaded), most with every metric NULL — only rows with at
  -- least one real metric count as a genuine snapshot, otherwise every
  -- geography in the country would wrongly report has_full_snapshot=true.
  snap as (
    select geography_id, median_sale_price_12m, sales_sample_confidence, median_weekly_rent_latest, rent_confidence, true as full_snap
    from mart.suburb_market_snapshot
    where dwelling_type is null and (median_sale_price_12m is not null or median_weekly_rent_latest is not null)
    union all
    select geography_id, median_sale_price_12m, sales_sample_confidence, median_weekly_rent_latest, rent_confidence, true as full_snap
    from mart.postcode_market_snapshot
    where dwelling_type is null and (median_sale_price_12m is not null or median_weekly_rent_latest is not null)
  ),
  -- Latest-quarter rent-only fallback for jurisdictions without a full
  -- wide snapshot (QLD/SA/WA) — 'all'/no-bedroom-detail dwelling_type row
  -- only, matching what the snapshot tables themselves represent.
  -- "Latest quarter WITH a published rent", not just the latest quarter
  -- that exists in the mart — a geography's most recent quarter can itself
  -- be a suppressed/NULL cell while an earlier quarter had a real value.
  rent_only as (
    select distinct on (geography_id) geography_id, median_weekly_rent, confidence_label
    from mart.suburb_rent_quarterly
    where median_weekly_rent is not null
    order by geography_id, reference_quarter desc
  ),
  rent_only_poa as (
    select distinct on (geography_id) geography_id, median_weekly_rent, confidence_label
    from mart.postcode_rent_quarterly
    where median_weekly_rent is not null
    order by geography_id, reference_quarter desc
  ),
  rent_only_lga as (
    select distinct on (geography_id) geography_id, median_weekly_rent, confidence_label
    from mart.lga_rent_quarterly
    where median_weekly_rent is not null
    order by geography_id, reference_quarter desc
  )
  select
    g.geography_id, g.geography_type, g.geography_code, g.geography_name, g.state_code,
    j.jurisdiction_code as jurisdiction,
    g.centroid_lat, g.centroid_lon,
    s.median_sale_price_12m, s.sales_sample_confidence,
    coalesce(s.median_weekly_rent_latest, ro.median_weekly_rent, rop.median_weekly_rent, rol.median_weekly_rent) as median_weekly_rent_latest,
    coalesce(s.rent_confidence, ro.confidence_label, rop.confidence_label, rol.confidence_label) as rent_confidence,
    coalesce(s.full_snap, false) as has_full_snapshot
  from core.dim_geography g
  left join meta.jurisdiction j on j.asgs_state_code = g.state_code
  left join snap s on s.geography_id = g.geography_id
  left join rent_only ro on ro.geography_id = g.geography_id and g.geography_type = 'SAL'
  left join rent_only_poa rop on rop.geography_id = g.geography_id and g.geography_type = 'POA'
  left join rent_only_lga rol on rol.geography_id = g.geography_id and g.geography_type = 'LGA'
  where g.geography_type in ('SAL', 'POA', 'LGA')
    and g.is_current
    and g.centroid_lat between p_min_lat and p_max_lat
    and g.centroid_lon between p_min_lon and p_max_lon
    and (p_geography_type is null or g.geography_type = p_geography_type)
    and (s.geography_id is not null or ro.geography_id is not null or rop.geography_id is not null or rol.geography_id is not null)
  limit v_limit;
end;
$$;
comment on function public.get_market_map_markers_v1 is
  'Bounding-box-limited map markers for the /research/map national explorer (Sprint 11 WS11). Row limit clamped 1-1500 and bounding box validated to Australia''s range inside the function — no unbounded public endpoint. Only returns geographies with at least one loaded metric (sale price or rent) — never a marker with nothing to show. Covers NSW/VIC (full snapshot) plus QLD/SA/WA (rent-only, via the Sprint 11 WS9 fact-layer promotion) — the first interface in this project to surface all 5 jurisdictions with loaded data together. No score, no ranking, no colour-coded "best suburb" implication left to this function — presentation choices belong to the frontend.';

grant execute on function public.get_market_map_markers_v1(numeric, numeric, numeric, numeric, text, integer) to anon, authenticated;
