# National coverage engine — future validation approval packet

Status: **prepared, not approved, not executed**.

This packet defines the evidence required before any remote validation. The
current Phase 2A work is local/offline only and authorises **zero** database rows.

## Identity

| Item | Value |
|---|---|
| Local branch | `feature/national-property-data-coverage-engine` |
| Parent | Phase 1 head `8fa60d1705546ec7d22445164d6858888fe73f29` |
| Production base at branch creation | `fbfe92def6126e22dcd369844e61bac284ca7f42` |
| Remote Phase 2 branch | none |
| Supabase validation branch | none |
| Vercel deployment | none |

Before any future validation, re-record exact Git head, target project ID,
Supabase branch ID, region, migration ceiling and expected cost. A mismatch is a
hard stop.

## Current candidate packet

| Item | Value |
|---|---|
| Candidate source | `wa_property_sales` |
| Adapter | `wa_property_sales@1-candidate` |
| Schema | `regional-data-hub-normalised@1` |
| Sanitised fixture payload checksum | `0e66dfcbc5b1dfe6a861c3eaeb5ed0894e4160fac5530acd4b0f39df935a92f2` |
| Candidate metrics | weekly sales count and turnover only |
| Median-price observations | 0 |
| Approved remote tables | none |
| Approved remote rows | 0 |
| Production publish delta | 0 |

The source catalogue is CC-BY-listed, but the live machine-readable schema has
not been acquired. Therefore this candidate cannot enter a remote validation
branch yet. A reviewed live resource checksum/header is mandatory first.

The official Tasmania CBOS page separately confirms monthly rental-bond XLSX
publication through data.gov.au. That is discovery evidence only: its exact
resource URL, reuse licence, workbook schema and adapter remain unresolved, so
it is not a validation candidate and contributes zero claimed coverage.

## Local gate (approved now)

Run only from the isolated worktree:

```bash
npm run warehouse:acquire:plan
npm run warehouse:acquire:dry-run
npm run warehouse:acquire:inbox
npm run warehouse:coverage:prioritise
npm run warehouse:coverage:simulate
npx vitest run
npm run typecheck:ci
npm run lint
npm run build
git diff --check
git status --short
```

Expected: no network for plan/dry-run/inbox, no DB connections, Production
coverage unchanged, review packet publish delta zero, tests/typecheck/lint/build
green.

## Preconditions for a separate remote validation approval

1. Exact official resource URL, checksum, byte length, MIME type, retrieval date,
   licence URL/attribution and live schema fingerprint are recorded.
2. The live parser test is generated from a small sanitised representative
   fixture and the full raw file stays gitignored.
3. Every candidate observation passes strict ASGS mapping, metric-aware value,
   period, natural-key, schema-drift, distribution, coverage-collapse and
   idempotency gates.
4. A purpose-built target schema for weekly count/turnover context is reviewed.
   Existing median-price or valuation fields must not be reused.
5. Exact target tables, upsert keys, maximum row count, SQL before/after queries,
   branch cost and branch lifetime are supplied. Blank/approximate values stop
   execution.
6. Production credentials, refs and service-role variables are absent from the
   validation process.

## Proposed write scope after those preconditions

None is proposed yet. The current repository has no approved destination for
the WA weekly context metrics. Designing or migrating such a table is a separate
change and approval. Until then, validation remains local only.

## Stop conditions

- project/branch/commit identity mismatch;
- missing or changed licence;
- HTML/portal error returned as data;
- checksum or schema fingerprint drift;
- unknown, cross-state or ambiguous geography mapping;
- suppression, non-positive or impossible-period value;
- duplicate natural key or non-idempotent rerun;
- candidate count collapses below the approved threshold;
- unexpected value distribution;
- any Production reference, write, deployment or environment change;
- any attempt to reinterpret count/turnover as median price or valuation.

## Cleanup and rollback model

Current cleanup is trivial: generated candidates/reports are local files and no
remote rows exist. For a future approved branch-only load, rollback must delete
only rows identified by `source_id` plus `file_checksum`, re-run before/after
counts, then delete the disposable validation branch after explicit approval.
Production rollback is neither needed nor authorised by this packet.

## Addendum — Official Coverage Uplift 1: SA metropolitan house price (verified_local)

A first genuine official price source has been proven end-to-end offline.
Evidence: `warehouse/reports/sa_metro_house_coverage_uplift.{json,md}`.

- **Candidate batch:** `sa_metro_median_house_sales`, Metropolitan Median House
  Sales Q2 2026 (Government of South Australia, CC BY 4.0). Resource SHA-256
  `9cfa8aa71d2c453c09ca1d3baecc1955144863cfb5c4caef01c12266e639ef7a`, schema
  fingerprint `6297926b…`, period 2026-06-30, retrieved 2026-08-23 (UTC).
- **Accepted:** 340 DIRECT observations — 170 `median_sale_price_detached` (AUD)
  and 170 `annual_price_growth_12m` (%, the publisher's own "Median Change") —
  across **170 unique ASGS 2021 SAL ids** (materiality ≥100 met). All rows pass
  the strict contract, natural-key, schema-drift, distribution, minimum-sample,
  coverage-collapse and idempotency gates (`admit = true`).
- **Quarantine:** 293 rows with explicit reasons (216 insufficient sample, 76
  suppressed/non-positive median, 1 zero-match `RIVERLEA PARK`); 0 ambiguous, 0
  conflicts, 38 identical duplicates deduped. No fabricated or zero-filled values.
- **Preconditions carried forward unchanged.** This packet still proposes **no**
  remote write. Turning the 170-SAL candidate footprint into published coverage
  requires a separately approved disposable-branch validation run supplying exact
  target table, upsert keys (`source_id` + natural key), row cap and before/after
  SQL. Overlap with published production is unknown (no database was read); **no
  net-new production coverage is claimed** and Production remains unchanged.
- **Stop conditions** in the list above apply verbatim to this batch; the run
  fails closed on schema drift, licence change, HTML-as-data, checksum/fingerprint
  drift, zero-match/ambiguous geography, suppression/non-positive value, duplicate
  natural key or non-idempotent rerun.
