# Provider-neutral data contract — Investment Opportunity Engine

Status: draft (SA vertical slice) · Consumers: `mart.suburb_scoring_input_v1`,
`get_investment_candidates_v1`, `lib/opportunity/*`.

The engine must accept **official, Domain, PropTrack or Cotality** data without code
changes. It reads one neutral shape; providers are swapped/added at the data layer.

## Four separated layers
1. **Source ingestion** — per-provider adapters under `warehouse/adapters/*` land raw
   rows. One adapter per provider; the engine never imports an adapter.
2. **Canonical metrics** — `core.official_observation` (today, official CC-BY). Each
   row already carries `source_id, licence, attribution, geography_id, property_type,
   bedroom_group, metric, value, unit, sample_size, period_start, period_end, status
   (direct|derived), retrieved_at`.
3. **Scoring inputs** — `mart.suburb_scoring_input_v1` (internal view) pivots canonical
   rows into **one row per (geography_id, property_type)** with the mandatory + optional
   metrics as columns, each accompanied by its provenance, after applying provider
   **precedence** and **conflict** rules.
4. **Consumer output** — `get_investment_candidates_v1` (SECURITY DEFINER, least-priv)
   returns only the scoring-input columns + provenance for accepted rows. `core`,
   `mart`, `meta` stay revoked from `anon`/`authenticated`.

## Provider registry (`meta.metric_provider`)
| column | meaning |
|---|---|
| `provider` | `official` \| `domain` \| `proptrack` \| `cotality` |
| `licence_class` | `open_cc_by` \| `licensed_restricted` |
| `precedence` | integer; **higher wins** on conflict |
| `redistribution_ok` | boolean; `false` ⇒ value may drive scoring but MUST NOT be exposed verbatim / redistributed |
| `active` | boolean; only active providers are assembled |

Seed (this slice): `official` → `open_cc_by`, `precedence = 100`,
`redistribution_ok = true`, `active = true`. Domain/PropTrack/Cotality are seeded
`active = false, redistribution_ok = false` as **placeholders** pending commercial
confirmation (below) — they are inert until a signed licence flips them on.

## Precedence & conflict rules (multiple providers disagree)
For a given `(geography_id, property_type, metric, period)`:
1. Consider only rows from `active` providers whose `status ∈ (direct, derived)`.
2. **Direct beats derived** for the same provider/metric.
3. Across providers, **highest `precedence` wins**. Official is highest today so nothing
   changes until a licensed feed is activated with a higher precedence.
4. If two rows tie on precedence and status, the **more recent `period_end`** wins;
   final tie-break `retrieved_at` desc, then `source_id` asc (deterministic).
5. A `licensed_restricted` value with `redistribution_ok = false` may be used to
   **compute** a score but the RPC returns its provenance as `provider` + `licence_class`
   only and **omits the raw value** from any redistributable field — the engine still
   receives it over the least-privilege boundary but the client payload never restates
   a licensed number verbatim. (In this slice all data is `open_cc_by`, so nothing is
   suppressed; the mechanism exists for future licensed feeds.)

## Least-privilege boundary
- `anon`/`authenticated` receive **EXECUTE only** on `get_investment_candidates_v1`.
- Schemas `core`, `mart`, `meta` remain revoked (no table/schema grant), matching
  migrations 046/047/053/054/057. Assurance A7 tests this from real client roles.

## Coverage gate (national launch) {#coverage-gate}
A **state** may be offered for ranking only when, for a material universe of that
state's suburbs, ALL mandatory dimensions (§ scoring spec: price, rent, yield, volume,
growth) are present and fresh from an **accepted** (active, redistribution-cleared)
provider. Until then the UI **hides or honestly blocks** ranking for that state.
Current status:

| State | price | rent | yield | volume | growth | Rankable? |
|---|---|---|---|---|---|---|
| SA | ✅ official | ✅ official | ✅ derived | ✅ official | ✅ official (signed) | **Yes (slice)** |
| VIC | ✗ | ✅ official (rent-only) | ✗ | ✗ | ✗ | No — honestly blocked |
| NSW | ✗ (licence required) | ⚠ CC-BY rents available, not yet ingested | ✗ | ✗ | ✗ | No — honestly blocked |
| QLD/WA/TAS/ACT/NT | ✗ | ✗ | ✗ | ✗ | ✗ | No — honestly blocked |

National ranking stays blocked until per-state gates pass. The product must not imply
Australia-wide coverage.

## Exact commercial confirmation still required (no vendor contacted)
Before a licensed provider can be activated (`active = true, redistribution_ok`):
- **Domain (Domain API / Insight / Pricefinder):** written confirmation of (1) suburb+
  postcode coverage & refresh, (2) house/unit + bedroom segmentation, (3) **redistribution
  / derived-display rights** to publish derived aggregate medians/yields/growth with
  attribution, (4) delivery (bulk/API) + volume tiers, (5) annual price vs ~AUD 25k target.
- **PropTrack (REA):** same five, plus enterprise-licence derived-display terms.
- **Cotality/CoreLogic (RP Data):** same five, plus per-clause derived/display negotiation
  (historically restrictive, likely > AUD 25k).
No terms are accepted and no data is ingested until these are confirmed in writing. See
`warehouse/reports/v5a/licensed_feed_comparison.md` for the ranked comparison.
