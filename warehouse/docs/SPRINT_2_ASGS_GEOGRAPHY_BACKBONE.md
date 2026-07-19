# Sprint 2 — ABS ASGS Geography Backbone (Plan)

Status: **planned, not implemented**. This sprint loads the geography backbone that
every later dataset depends on. Nothing here changes remote Supabase without approval.

## Goal

Populate `core.dim_geography`, `core.bridge_geography_relationship` and
`core.bridge_geography_correspondence` with the full ASGS Edition 3 (2021) picture so
that any source published at SA2/LGA level can be re-expressed at suburb (SAL) and
postcode (POA) level with explicit, auditable weights.

## 1. Source discovery (official ABS only)

Script: `warehouse/scripts/geography/discover_asgs_sources.mjs` (placeholder today).

- Start from the ABS ASGS Edition 3 landing page and the ABS "Data downloads" pages:
  - Main structure (SA1, SA2, SA3, SA4, GCCSA, STATE) — digital boundary files
  - Non-ABS structures (SAL, POA, LGA) — digital boundary files
  - Correspondence / allocation files (ABS publishes SA1-based allocations for
    non-ABS structures)
- Prefer **GeoPackage (.gpkg)** over shapefile; CSV allocation files where offered.
- Record every discovered artefact in `meta.source_file`-shaped entries (URL, format,
  reference period, hash once downloaded) and register datasets in
  `warehouse/metadata/source_register.csv` / `meta.dataset`.
- Licence check: all ABS boundary and correspondence products are CC BY 4.0 —
  confirm per file before load.

## 2. Required geography levels

STATE, GCCSA, SA4, SA3, SA2, SA1, LGA, SAL, POA — all at ASGS Edition 3 (2021),
`boundary_version = 'ASGS3_2021'`, one `core.dim_geography_version` row per type.

## 3. Required correspondences

| Source | Target | Basis |
|---|---|---|
| SA1 | SAL | ABS allocation file (SA1s allocated to Suburbs and Localities) |
| SA1 | POA | ABS allocation file |
| SA1 | LGA | ABS allocation file |
| SA2 | SAL | Derived: aggregate SA1→SAL allocations up to SA2, weighted |
| SA2 | POA | Derived: aggregate SA1→POA allocations up to SA2, weighted |
| SA2 | LGA | Derived: aggregate SA1→LGA allocations up to SA2, weighted |

Weights per `warehouse/config/geography.yml`: dwelling count first (from Census SA1
dwelling counts when available), then population, then area (computed from geometry).
`preferred_weight` records whichever basis was actually used; `correspondence_method`
records how it was built (`abs_sa1_allocation` vs `derived_sa1_aggregation` vs
`spatial_overlay`).

## 4. Raw file preservation (outside git)

- Downloads land in `warehouse/data/asgs/<edition>/<file>` — this path is **gitignored**
  (`warehouse/data/` and `data/` are excluded; boundary files are hundreds of MB).
- Every file gets a SHA-256 hash recorded so loads are reproducible and re-downloads
  are detectable; the hash + URL + period is what gets committed (in metadata), never
  the file.
- No raw file is ever modified in place; re-downloads go to a new dated folder.

## 5. Staging plan

One staging table per structure, source-shaped, typed, no conformance yet:

- `staging.asgs_area` — one row per area per structure file (type, code, name, state,
  area sq km, geometry as loaded + SRID recorded)
- `staging.asgs_allocation` — one row per SA1 → {SAL|POA|LGA} allocation row as
  published, including ABS ratio columns

Geometry is transformed to EPSG:4326 at staging load time (`ST_Transform`), with the
source SRID (GDA2020 / EPSG:7844 expected) recorded per file.

## 6. core.dim_geography load plan

- Insert one row per area per type with
  `geography_id = '<TYPE>_<CODE>_ASGS3_2021'`.
- `parent_geography_id` set **only** within the strict containment hierarchy
  (SA1→SA2→SA3→SA4→GCCSA→STATE). SAL, POA and LGA get NULL parents — they are
  linked via correspondence, never via parent pointers (suburb ≠ postcode ≠ SA2).
- `geom` populated as MultiPolygon 4326; centroid and area computed from geometry
  (`ST_Centroid`, `ST_Area` on a projected CRS) rather than trusted from source.
- Idempotent upsert on `(geography_type, geography_code, boundary_version)`.

## 7. bridge_geography_relationship load plan

- One `contains` row per child→parent pair in the containment hierarchy, derived from
  the ABS main-structure codes (SA2 code embeds SA3, etc. — verify by join, don't
  parse codes blindly).
- Validity window = boundary version window.

## 8. bridge_geography_correspondence load plan

- Load SA1-based allocations directly from ABS files.
- Derive SA2→{SAL,POA,LGA} by aggregating SA1 allocations with dwelling/population
  weights; fall back to area weights computed by spatial overlay where SA1 counts are
  unavailable.
- Every row records method, version and a confidence score (official allocation = 1.0;
  derived aggregation lower; pure spatial overlay lowest).

## 9. Validation gates (block promotion to core on failure)

1. **Duplicate geography codes = 0** per (type, boundary_version).
2. **Invalid geometries = 0** (`ST_IsValid`) — invalid rows are quarantined and
   counted in `meta.load_run.records_quarantined`, never silently fixed or dropped.
3. **Missing SAL/POA/SA2 = 0** vs ABS published counts (see
   `geography_dictionary.csv` approx counts) unless the gap is documented in
   `meta.coverage_result.details`.
4. **Correspondence weights reconcile**: weights for each source area sum to 1.0
   (±0.001) per target type; residuals documented.
5. **Missing data remains NULL** — unknown dwelling/population weights stay NULL and
   force area-weight fallback; nothing is imputed as zero.

All gate results are written to `meta.data_quality_result` / `meta.coverage_result`
under the rule ids in `warehouse/config/quality_rules.yml`.

## 10. Approval boundary

- Migrations 003 and 004 must be applied to the linked Supabase project **only after
  explicit approval** — they are prerequisites for this sprint.
- Loads run against a local/branch database first; promoting loaded geography to the
  linked project is itself an approval-gated step.
- No remote Supabase changes of any kind without approval.

## Deliverables checklist

- [ ] `discover_asgs_sources.mjs` implemented (produces a source manifest, no big downloads in repo)
- [ ] `load_asgs_backbone.mjs` implemented (staging → core → bridges with gates)
- [ ] `meta.source` / `meta.dataset` rows for ASGS registered
- [ ] All 9 levels present in `core.dim_geography` with geometry
- [ ] All 6 correspondences loaded with reconciling weights
- [ ] Validation gates green, results recorded in meta tables
