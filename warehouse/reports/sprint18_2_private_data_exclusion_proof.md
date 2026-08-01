# Sprint 18.2 Phase 6 — Private-Data Exclusion Proof

Snapshot under test: `wh-snap-2026-07-31-ed76873c-min21` (the 21-table
minimum launch contract from Phase 4/5).

## Allow-list (eligible — restated from Phase 4/5)

`core.dim_geography`; `mart.{suburb,postcode}_market_snapshot`,
`mart.{suburb,postcode}_demographic_profile_2021`,
`mart.{suburb,postcode}_market_timeseries`,
`mart.{suburb,postcode,lga}_rent_quarterly`; `meta.dataset`, `meta.source`,
`meta.dataset_freshness_status`, `meta.dataset_refresh_run`,
`meta.metric_lineage_registry`, `meta.metric_assumption`,
`meta.jurisdiction`, `meta.data_incident`, `meta.data_quality_rule`,
`meta.data_quality_run`, `meta.data_quarantine_summary` — 21 tables, all
verified-public-source or derived-from-verified-public-source data, plus
required lineage/freshness/quality metadata.

## Deny-list (prohibited — confirmed absent from the snapshot)

`auth.*`, `storage.*`, `public.user_feedback`, `public.user_onboarding_preferences`,
`public.notification_preferences`, `public.portfolio_properties`,
`public.property_comparisons`, `public.property_reports`,
`public.research_copilot_queries`, `public.scenario_lab_cases`,
`public.strategy_generations`, `public.strategy_reports`,
`public.user_entitlements`, `public.waitlist`,
`public.watchlist_change_events`, `public.watchlist_items` (the complete
14-table Production `public` schema list from the Phase 2 fingerprint, plus
`auth`/`storage`), any UAT account, cookie, token, secret, or credential.

## Proof (four independent checks, not an assertion)

**1. Schema separation.** The snapshot's SQL capture (Phase 5) queried
exclusively `core.*`/`mart.*`/`meta.*` objects. The `public`, `auth`, and
`storage` schemas were never queried during capture — confirmed by the
capture script/query log itself (Phase 5 document), not merely by
intention.

**2. Column-name scan across all 21 tables** for any PII-shaped column
(`%user%`, `%email%`, `%password%`, `%token%`, `%session%`, `%cookie%`,
`%ip_add%`, `%phone%`, `%secret%`, `%auth%`, `%owner%`, `%created_by%`,
`%first_name%`, `%last_name%`, `%full_name%`, `%address%`, `%credential%`,
`%key%`). **Result: only 5 matches, all false positives** —
`owner_occupier_pct`, `owner_with_mortgage_pct`, `owner_outright_pct`,
`owner_with_mortgage_share`, `est_monthly_repayment_owner_occupier` are
Census-derived *aggregate percentages* of homeownership at suburb/postcode
grain (e.g. "38% of dwellings in this suburb are owner-occupied") — not an
individual owner's identity. Zero matches for any actual identity, contact,
credential, or session-shaped column.

**3. Foreign-key trace across all 21 tables.** Every foreign key from any
of the 21 tables points only to `core.dim_geography`, `meta.jurisdiction`,
`meta.dataset`, `meta.source`, `meta.data_quality_rule`, or two
non-allow-listed-but-still-warehouse-internal tables
(`meta.data_quality_result`, `meta.load_run` — ETL bookkeeping, not user
data). **Zero foreign keys reference any `public.*`, `auth.*`, or
`storage.*` table.** There is no structural path for user data to have
entered these 21 tables via a relationship.

**4. Content spot-check.** Sampled rows directly:
- `core.dim_geography`: geography id/type/code/name, state code, centroid
  lat/lon — e.g. `STATE_1_ASGS3_2021` / "New South Wales". Pure ASGS
  geographic reference data.
- `meta.dataset`: dataset id/name, source id, refresh frequency, period
  range — e.g. "ASGS Ed.3 Statistical Areas Level 2 (SA2) digital
  boundaries, GDA2020 shapefile". Pure dataset catalog metadata.
- `meta.source`: source id/name, publisher, URL, licence — e.g. "NSW
  Valuer General Property Sales Information" / "NSW Valuer General" / CC BY
  4.0. Pure public-source attribution metadata, all with visible
  government/statistical-agency publishers and open licences.

No row across any sampled table contains anything resembling a person's
name, contact detail, credential, or session artifact.

## Conclusion

**No private or user-owned data is present in this snapshot.** All four
checks are independent and mutually reinforcing: schema isolation (nothing
outside core/mart/meta was ever touched), column-level scan (no
PII-shaped columns beyond one harmless false-positive family), referential
isolation (no FK path from user data), and direct content inspection (only
public-source geographic/dataset/source metadata observed). Proceeding to
Phase 7 (transport tooling) on this basis.
