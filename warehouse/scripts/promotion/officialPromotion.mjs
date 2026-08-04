/**
 * Deterministic loader + validation for the official-source promotion candidate
 * (migration 056). Idempotent and order-independent; an existing observation id
 * with DIFFERENT content is never overwritten (fail closed). Executed against
 * real PostgreSQL (PGlite) by promotion_rehearsal.test.ts — no remote write.
 */

/** Idempotent insert into core (fail-closed on id conflict) then the direct mart. */
export const INSERT_OBSERVATION = `
  insert into core.official_observation
    (observation_id, source_id, resource_sha256, geography_id, geography_level, asgs_version,
     metric, property_type, bedroom_group, value, unit, sample_size, period_start, period_end,
     status, quality_status, formula_version, price_observation_id, rent_observation_id,
     licence, attribution, retrieved_at)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
  on conflict (observation_id) do nothing`;

export const INSERT_MART = `
  insert into mart.official_suburb_metric
    (geography_id, metric, property_type, bedroom_group, value, unit, sample_size, period_end, status, source_id, attribution)
  select o.geography_id, o.metric, o.property_type, o.bedroom_group, o.value, o.unit,
         o.sample_size, o.period_end, o.status, o.source_id, o.attribution
  from core.official_observation o
  where o.observation_id = $1
    and o.status in ('direct','derived')  -- contextual + quarantine never reach the mart
  on conflict (geography_id, metric, property_type, bedroom_group, period_end) do nothing`;

/** Post-load validation (each returns `violations`; a clean candidate yields 0). */
export const POSTLOAD_VALIDATIONS = [
  { name: "mart_direct_only_in_view", sql: `select count(*)::int violations from v_official_suburb_metric_v1 where status <> 'direct'` },
  // Metric-aware (migration 058): every metric EXCEPT the signed price_growth_12m
  // must be strictly positive; growth may be <= 0 but must stay within [-100, 1000].
  { name: "no_non_positive_values", sql: `select count(*)::int violations from mart.official_suburb_metric where metric <> 'price_growth_12m' and value <= 0` },
  { name: "growth_within_signed_bounds", sql: `select count(*)::int violations from mart.official_suburb_metric where metric = 'price_growth_12m' and (value < -100 or value > 1000)` },
  { name: "no_contextual_in_mart", sql: `select count(*)::int violations from mart.official_suburb_metric where status = 'contextual'` },
  { name: "derived_yield_inputs_exist", sql: `
      select count(*)::int violations from core.official_observation y
      where y.metric = 'gross_yield'
        and ( not exists (select 1 from core.official_observation p where p.observation_id = y.price_observation_id)
           or not exists (select 1 from core.official_observation r where r.observation_id = y.rent_observation_id) )` },
];

/**
 * Representative REAL-derived candidate rows (SA + VIC), including 3 qualified SA
 * house yields, VIC bedroom-specific rent, and a CONTEXTUAL row that must NOT
 * reach the direct mart view. Values are real (SA Belair/Stirling, VIC Armadale).
 * observationValues(row) returns the ordered INSERT_OBSERVATION params.
 */
const L = { licence: "CC BY 4.0", attr: "© Government of South Australia (CC BY 4.0)", now: "2026-08-02T00:00:00Z" };
export const PAYLOAD = [
  // SA Belair — direct house price + house rent -> qualified yield
  { id: "obs_sa_belair_price", src: "sa_metro_median_house_sales", sha: "9cfa8aa7", geo: "SAL_40085_ASGS3_2021", metric: "median_house_price", pt: "house", bg: "all", val: 1455000, unit: "AUD", n: 16, ps: "2026-04-01", pe: "2026-06-30", status: "direct" },
  { id: "obs_sa_belair_rent", src: "sa_private_rental_report", sha: "d0db486e", geo: "SAL_40085_ASGS3_2021", metric: "median_rent", pt: "house", bg: "all", val: 700, unit: "AUD/week", n: 40, ps: "2026-01-01", pe: "2026-03-31", status: "direct" },
  { id: "obs_sa_belair_yield", src: "derived", sha: "derived", geo: "SAL_40085_ASGS3_2021", metric: "gross_yield", pt: "house", bg: "all", val: 2.5, unit: "%", n: 16, ps: "2026-01-01", pe: "2026-06-30", status: "derived", formula: "gross_yield@2", price: "obs_sa_belair_price", rent: "obs_sa_belair_rent" },
  // SA Stirling — direct house price + rent + yield
  { id: "obs_sa_stirling_price", src: "sa_metro_median_house_sales", sha: "9cfa8aa7", geo: "SAL_40806_ASGS3_2021", metric: "median_house_price", pt: "house", bg: "all", val: 1520000, unit: "AUD", n: 22, ps: "2026-04-01", pe: "2026-06-30", status: "direct" },
  { id: "obs_sa_stirling_rent", src: "sa_private_rental_report", sha: "d0db486e", geo: "SAL_40806_ASGS3_2021", metric: "median_rent", pt: "house", bg: "all", val: 780, unit: "AUD/week", n: 25, ps: "2026-01-01", pe: "2026-03-31", status: "direct" },
  { id: "obs_sa_stirling_yield", src: "derived", sha: "derived", geo: "SAL_40806_ASGS3_2021", metric: "gross_yield", pt: "house", bg: "all", val: 2.67, unit: "%", n: 22, ps: "2026-01-01", pe: "2026-06-30", status: "derived", formula: "gross_yield@2", price: "obs_sa_stirling_price", rent: "obs_sa_stirling_rent" },
  // VIC Armadale — direct 2br house rent (bedroom-specific)
  { id: "obs_vic_armadale_rent2h", src: "vic_dffh_moving_annual_rent", sha: "817c5b8e", geo: "SAL_20001_ASGS3_2021", metric: "median_rent", pt: "house", bg: "2", val: 798, unit: "AUD/week", n: 30, ps: "2024-07-01", pe: "2025-06-30", status: "direct", attr: "© State of Victoria (DFFH) (CC BY 4.0)" },
  // A CONTEXTUAL row (postcode-level) that must NOT reach the direct view
  { id: "obs_ctx_postcode_rent", src: "context", sha: "ctx", geo: "POA_2527_ASGS3_2021", metric: "median_rent", pt: "house", bg: "all", val: 710, unit: "AUD/week", n: 100, ps: "2026-01-01", pe: "2026-03-31", status: "contextual" },
];

/**
 * Representative SIGNED price_growth_12m rows (migration 058) — direct, source-
 * published "Median Change" (percent, sign preserved). Negative, zero and positive
 * cases (real SA extrema: min -6.11, max 41.61). Distinct geographies so each has
 * its own mart PK. Loaded ON TOP OF migration 058's metric-aware value invariant.
 */
export const GROWTH_PAYLOAD = [
  { id: "obs_growth_neg", src: "sa_metro_median_house_sales", sha: "9cfa8aa7", geo: "SAL_40085_ASGS3_2021", metric: "price_growth_12m", pt: "house", bg: "all", val: -6.11, unit: "%", n: 16, ps: "2025-06-30", pe: "2026-06-30", status: "direct" },
  { id: "obs_growth_zero", src: "sa_metro_median_house_sales", sha: "9cfa8aa7", geo: "SAL_40806_ASGS3_2021", metric: "price_growth_12m", pt: "house", bg: "all", val: 0, unit: "%", n: 22, ps: "2025-06-30", pe: "2026-06-30", status: "direct" },
  { id: "obs_growth_pos", src: "sa_metro_median_house_sales", sha: "9cfa8aa7", geo: "SAL_40120_ASGS3_2021", metric: "price_growth_12m", pt: "house", bg: "all", val: 41.61, unit: "%", n: 21, ps: "2025-06-30", pe: "2026-06-30", status: "direct" },
];

export function observationValues(r) {
  return [r.id, r.src, r.sha, r.geo, "suburb", "ASGS3_2021", r.metric, r.pt, r.bg, r.val, r.unit, r.n ?? null,
    r.ps ?? null, r.pe, r.status, "passed", r.formula ?? null, r.price ?? null, r.rent ?? null, L.licence, r.attr ?? L.attr, L.now];
}
