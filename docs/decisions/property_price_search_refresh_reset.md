# Property Price Search & Refresh — Reset / Factual Baseline (Phase 1)

**Branch:** `feature/property-price-refresh-search-foundation` · **Base:** `origin/main` @ `fbfe92def6126e22dcd369844e61bac284ca7f42` · **Worktree:** `C:\Users\abdul\property-ai-pricedata` (isolated). Australian English. Read-only audit — **no remote writes, no migrations applied, no env/deploy changes, no auth/magic-link work; founding beta stays dark; PR #44 untouched.**

## TL;DR
Propellect **already has** a mature, honest-by-design property-data warehouse and serving path — a licensed source registry, a tiered refresh engine (v3) with dry-run/plan/execute/validate, coverage/quality/freshness/lineage tooling, field-level provenance with `direct / derived / contextual / unavailable` classification, and a **connected** `/research/suburb` surface. The sprint's real problem is **coverage**, not missing plumbing: suburb **geography is 100%** but **sale price ≈31%**, **rent ≈20%**, **yield ≈3%**, **growth ≈5%** — because sales/rent come from a handful of state sources, and increasing live coverage requires running adapters that perform **remote writes (disabled this sprint)**. This sprint therefore audits truthfully and adds **offline, reproducible coverage/freshness/provenance measurement** without touching any remote system.

## 1. What genuinely exists (verified in-repo)
| Layer | Artifact | Status |
|---|---|---|
| **Geography backbone** | ASGS 2021 SAL/POA/LGA/SA1-4/GCCSA/STATE spine; 15,334 suburb (SAL) snapshots | Real, 100% |
| **Source registry** | `warehouse/config/v3_source_registry.json` (+`.mjs`, +tests) — 10 sources with `licence`, `commercial_reuse`, `attribution`, `resource_url`, `geography_level`, `cadence`, `parser_version` | Real, licensed |
| **Refresh engine** | `warehouse/scripts/orchestration/refresh_engine_v3.mjs` via `npm run warehouse:refresh:{plan,dry-run,dataset,domain,jurisdiction,stale,status,validate}`; registry `warehouse/config/refresh_registry.mjs` (tiered `DATASETS`, `depends_on`, build/validate/branch-load scripts, per-dataset local reports) | Real, dry-run + validate supported |
| **Adapters** | `warehouse/adapters/{nsw,qld,sa,qld_rta_rent}/…` (sales/rents/supply) | Partial (see gaps) |
| **Marts / views** | migrations `003,004,008,013,048–052,056–057`; `v_suburb_market_snapshot_v1`, `v_official_suburb_metric_v1`, `mart.official_suburb_metric`, `get_market_snapshot`/candidate RPCs | Real |
| **Provenance / fallback** | `lib/research/metricFallback.ts` — per-metric precedence (direct → derived → contextual → unavailable) with hard geography/property-type/bedroom compatibility rules and explicit `fallbackReason` | Real, honest |
| **Serving path** | `/research/suburb/[geographyCode]` → `lib/warehouse/queries.ts` (connected to warehouse views) | Real, connected |
| **Measurement** | `warehouse/scripts/coverage/suburb_metric_coverage.mjs` (read-only PostgREST count), `warehouse:quality:{check,report}`, `warehouse:freshness`, `warehouse:lineage:check` | Real, but require a live read-only warehouse connection |
| **Reports** | `warehouse/reports/suburb_metric_coverage.json`, `national_coverage_audit.json`, `quality_summary_report.json`, manifests | Real, dated snapshots |

## 2. What is implemented but disconnected / obsolete
- **`/suburb-intelligence`** is a **dead placeholder** — its own source comment states it was "an unfinished placeholder that shared the warehouse-preview flag"; it now `notFound()`s / defers to `/research`. The live, warehouse-connected surface is **`/research/suburb/[geographyCode]`**. (No warehouse data is stranded behind it — but the stale route should be retired to avoid confusion.)
- **Coverage/quality/freshness scripts are online-only:** they query the live warehouse via `WAREHOUSE_SUPABASE_URL`/`ANON_KEY`. There is **no offline/local reproducible coverage measurement** from committed report artifacts — so "measure coverage reproducibly" currently depends on a remote read.

## 3. What is missing (true gaps)
- **Sales-price sources exist for only SA, VIC, NSW.** No sales source registered for **QLD, WA, TAS, NT, ACT** (QLD/WA/TAS have rent-only; NT/ACT absent entirely).
- **Rent sources** cover SA, VIC, QLD, WA, TAS — but **not NSW at suburb level in the registry snapshot**, and not NT/ACT.
- **Yield (3%)** and **growth (5%)** are **derived** and therefore bounded by the *intersection* of price∩rent (yield) and price time-series depth (growth) — small by construction.
- No single **offline coverage+freshness+provenance reconciliation** artifact that a reviewer can regenerate without warehouse credentials.

## 4. Which historical coverage claims are verifiable
**All headline claims verified** against `warehouse/reports/suburb_metric_coverage.json` (generated 2026-08-02, method: read-only live count vs `warehouse-validation`):

| Metric | Claimed | Report (populated / 15,334) | Verdict |
|---|---|---|---|
| Suburb snapshots | 15,334 | 15,334 | ✅ |
| Median sale price (overall 12m) | 31.44% | 4,821 → 31.4% | ✅ |
| Median house price (detached) | (≈31%) | 4,756 → 31% | ✅ |
| Median unit price | — | 1,454 → 9.5% | ✅ (added) |
| Median weekly rent | 20.14% | 3,089 → 20.1% | ✅ |
| Gross yield | 2.95% | 453 → 3% | ✅ |
| 12-month price change | 4.79% | 735 → 4.8% | ✅ |
| Dwelling stock | 100% | 15,334 → 100% | ✅ |
| Building approvals | 99.97% | 15,329 → 100% | ✅ |
| Demographics | 100% | (population column populated) | ✅ (spot-verified) |

The "452,176 rows / 21 tables" figure is a **historical warehouse-wide count**, not re-countable offline here (needs a live connection); treated as an unverified historical claim, not relied upon. The coverage percentages above are the **authoritative, in-repo, dated** baseline.

## 5. Every current data source and its permitted use (`v3_source_registry.json`)
| Jurisdiction | Source (name) | Domain | Licence / reuse |
|---|---|---|---|
| SA | Metropolitan Median House Sales (Valuer-General) | sales (house) | CC BY 4.0 — commercial + derivative ✅ |
| SA | Private Rental Report | rents | (per registry `licence`) |
| VIC | Moving Annual Median Rent by Suburb & Town | rents | (per registry) |
| VIC | Victorian Property Sales Statistics | sales | (per registry) |
| NSW | Valuer-General Bulk Property Sales Information | sales | (per registry) |
| QLD | RTA Median Rents Quarterly | rents | (per registry) |
| WA | WA Rental Bonds | rents | (per registry) |
| TAS | TAS Rental Bond Statistics | rents | (per registry) |
| AU | ABS ASGS + 2021 Census SAL DataPacks / Regional Population | geography, demographics, population | ABS open (CC BY) |
| AU | Pre-existing local warehouse artifacts (~2.3 GB) | mixed staging | internal |

*(Exact `licence`/`attribution`/`commercial_reuse` fields are carried per-source in the registry JSON; the new offline summariser below surfaces them so licensing is never lost.)*

## 6. How data currently moves source → interface
`registered source (ckan_api / bulk file)` → `warehouse/adapters/<state>/<domain>` (acquire + normalise) → `warehouse/scripts/{load,transform,promotion}` (staging → core → mart, gated by `warehouse:quality:*` + `warehouse:lineage:check`) → `mart.official_suburb_metric` / `v_suburb_market_snapshot_v1` → `lib/warehouse/queries.ts` → `/research/suburb/[geographyCode]` UI. Field-level display honesty is enforced by `lib/research/metricFallback.ts` (direct/derived/contextual/unavailable + reason). Refreshes are orchestrated by `refresh_engine_v3.mjs` (tiered, dependency-aware, dry-run/validate/execute).

## 7. Why a suburb can exist in geography but lack price/rent
1. **No source for its state/domain** — e.g. an ACT or NT suburb has geography (ASGS) + ABS demographics/approvals (national), but **no registered sales/rent source** → price/rent legitimately `unavailable`.
2. **Source publishes coarser or partial data** — some state datasets cover metro only, or suppress low-transaction suburbs (privacy/thresholds) → suburb present but median null.
3. **Derived-only metrics** — yield needs price *and* rent for the *same* suburb/type; growth needs ≥2 comparable periods → absent wherever an input is missing.
4. **Not yet refreshed** — a registered source whose adapter hasn't been run (remote-write, disabled here) contributes nothing until executed.
The correct product behaviour (already the design intent) is to show the **specific reason**, never a fabricated value and never a generic "coming soon".

## 8. Highest-value coverage gaps (ranked by expected gain × effort)
1. **QLD sales medians** — QLD has geography+rent but **no sales source**; adding an official QLD sales-median source would lift national sale-price coverage materially (large state). *High gain / medium effort.*
2. **NSW rent at suburb level** — NSW has sales but rent is thin; NSW Rental Bond (Fair Trading) suburb medians would lift rent + unlock yield in the largest market. *High gain / medium effort.*
3. **WA/TAS sales medians** — rent exists; add sales to unlock yield there. *Medium gain / medium effort.*
4. **ACT + NT** — no sources at all; add ACT (allhomes/Access Canberra) + NT valuer data. *Medium gain / higher effort.*
5. **Offline coverage/freshness reproducibility** (this sprint) — so any reviewer can measure coverage without warehouse creds. *Low effort / enables everything.*

## 9. This sprint's safe increment (Phase 2, offline only)
Because live coverage expansion needs remote writes (out of scope), this sprint adds **offline, reproducible, tested** measurement and a formal metric-provenance contract that compose existing components (no competing warehouse):
- `lib/warehouse/metricProvenance.ts` — pure function turning a snapshot metric + registry entry into a canonical `{value, unit, source, sourceUrl, reportingPeriod, sourcePublished, ingestedAt, classification (direct|derived|fallback|unavailable), freshness, confidence, missingReason, method}` record. Unit-tested.
- `warehouse/scripts/coverage/coverage_freshness_summary.mjs` — reads **committed** `suburb_metric_coverage.json` + `v3_source_registry.json` (+ optional refresh reports) and emits a reproducible coverage×freshness×licence summary distinguishing **direct vs derived vs missing**; **no network, no writes**. Default dry-run.
See §Definition-of-done mapping in the final report.

## 10. Boundaries honoured
No auth/magic-link work; PR #44 untouched & draft; founding beta dark; no env/Vercel/Supabase changes; no deploy/redeploy; no Production/Preview writes; no migrations applied; no branch merge/delete; no scraping of protected portals; existing dirty worktrees & user files untouched; nothing fabricated (all numbers cite the in-repo report).
