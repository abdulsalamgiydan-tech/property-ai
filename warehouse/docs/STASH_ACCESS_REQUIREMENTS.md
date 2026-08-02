# Stash Property API — access & licensing requirements

**Status: NO ACCESS CONFIGURED. Integration ships disabled and fixture-tested. No live Stash request has been made.**

This records the Phase 1 licensing-gate outcome for the Suburb Intelligence + Stash
coverage work and exactly what is required before any live call is enabled.

## Current repository state (verified)

- No Stash environment variables are set (`.env.example`, `.env.local` contain none).
- No Stash credentials, code, or configuration exist in the repo.
- `isStashEnabled()` returns `false`; `createStashClient()` returns `null`, so the
  application degrades gracefully to Propellect-only data.

Inspected by environment-variable **name only** — no values were read or printed.

## What the official documentation shows

Sources inspected (read-only, no scraping, no logged-in automation):
- https://www.stashproperty.com.au/api/ — access, tiers, permitted use.
- https://www.stashproperty.com.au/app/api/v2/data/docs/ — Swagger UI (renders
  client-side; the exact wire schema could **not** be captured statically and
  must be re-verified against the live OpenAPI spec once access is granted).
- https://www.stashproperty.com.au/privacy/ — terms relevant to third-party use.

Relevant documented terms:
- **Access** is by contacting Stash (hello@stashproperty.com.au). Tiered:
  Level 1 (lookup), Level 2 (suburb statistics), Level 3 (property + suburb with
  media). Usage-band (volume) pricing; consumer-facing packages exist but are
  quoted per use case; some packages carry a 12-month+ minimum commitment.
- **Caching is capped at a maximum of 24 hours** for property data; on
  termination all cached/stored API data must be deleted within 30 days.
- **Storage location**: using the data **outside Australia** is prohibited
  without explicit permission.
- **Prohibited**: automated scraping, data mining, **bulk extraction**,
  sequential-ID enumeration, mirroring/replicating Stash data, and building a
  competing property database.

## Required before enabling live calls (the exact gate)

1. A licensed Stash API package that explicitly permits:
   - consumer-facing display within Propellect;
   - the intended suburb-level fields (median sale price by house/unit, median
     rent, gross yield, vacancy rate, days on market, sales volume, demographics)
     across the intended Australian suburb coverage;
   - **derived metrics** (e.g. computing yield/growth) and **attribution** as
     "Stash Property";
   - the expected request volume (see below).
2. Server-side credentials provisioned as environment variables (never
   `NEXT_PUBLIC_*`, never committed):
   - `STASH_API_BASE_URL`
   - `STASH_API_KEY`
   - `STASH_ENABLED=true`
3. Written confirmation of the permitted **cache duration** (the adapter must be
   configured to honour ≤ 24h) and **Australian storage** location.
4. Explicit written permission before any **national backfill / bulk extraction**
   — the default terms forbid it, so the staged importer is **not** built and
   **not** run under current terms.

## Caching & request-volume assumptions (bounded, on-demand)

Because bulk storage is not licensed, the intended pattern is **bounded
server-side on-demand retrieval** at page render, per the adapter's built-in
limits:
- per-instance request budget (default 50) and sliding-window rate limit
  (default 30/min) — see `lib/stash/client.ts`;
- one suburb page view resolves at most: 1 locality lookup + 1 statistics call
  (+ optionally 1 timeseries, 1 demographics, 1 recent-sales), i.e. **≤ 5
  requests/page**, only for fields Propellect cannot supply;
- any cache layer added later must respect the **≤ 24h** cap and store in
  Australia only. No cache is implemented yet (none is needed while disabled).

## Recommendation

`READY BUT REQUIRES STASH ACCESS` — the typed server-side boundary, schema
validation, locality matching, fallback resolver, fixtures and tests are
complete and green; live calls remain gated off pending a licensed package and
the credentials/permissions above.
