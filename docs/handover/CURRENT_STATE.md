# Propellect — Current State (Handover)

**Audit date:** 2026-07-19  
**Repo package name:** `property-ai`  
**Brand:** Propellect  
**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Supabase Auth + Postgres, Anthropic Claude (Strategy only), Vitest, Vercel Analytics  

This document is a read-only audit for handover. It does not include secrets, `.env` values, or production data.

---

## What the app currently does

Propellect is an Australian residential property investment analysis web app. Users can:

1. **Analyse a deal** — model stamp duty (by state), LMI, year-1 cashflow, yields, depreciation estimate, deal score, long-term projections, and announced **Budget 2026** tax scenarios (negative gearing ring-fencing, carry-forward, commencement-based CGT).
2. **Compare two properties** — same analysis engine side-by-side with comparative insights and charts.
3. **Generate a personalised strategy** — form → deterministic archetype selection (12 archetypes) → Claude personalisation → persisted report (auth + rate limit required).
4. **Save and revisit work** — property reports, comparisons, watchlist, and a simple portfolio tracker (Supabase, signed-in).
5. **Browse a Suburb Intelligence shell** — search UI only; metrics are placeholders until a data source is connected.

Positioning in product copy: independent, illustrative modelling for everyday Australian investors — **not** personal financial, tax, or legal advice. Strategy LLM must not name specific suburbs or addresses.

**Production hosts (from code):** magic links for Propellect hosts always redirect via `https://app.propellect.com.au/auth/callback` (apex / www / app are normalised).

---

## What is complete

| Area | Status |
|------|--------|
| Deal Analyser (`/analyse-property`) | Mature client + `lib/propertyAnalysis.ts` + projections + Budget 2026 tax UI |
| Budget 2026 tax model | Implemented under `lib/tax/` with Vitest coverage |
| Compare Properties | Full dual-form flow + insights + charts + save |
| Strategy Generator | Form, cascade archetypes, Claude API, Zod I/O, persist, rate limit |
| Auth (magic link OTP) | Supabase SSR, callback/complete/error, middleware session refresh |
| Preview mode without Supabase | Tools usable when env keys missing (`hasFullToolAccess`) |
| Waitlist insert on OTP send | `waitlist` table |
| Saved reports / dashboard / portfolio / watchlist | CRUD via browser Supabase client + RLS |
| Design primitives | Tokens, cards, LogoMark, CTA, etc. under `components/design/` |
| Local drafts | Analyse/compare drafts in `localStorage` |

---

## What is incomplete

| Area | Gap |
|------|-----|
| **Suburb Intelligence** | UI shell only; all metrics “Data coming soon”; no API |
| **Suburb → assumptions** | `lib/suburbAssumptions.ts` always returns `null` |
| **Australian residential property warehouse** | **Not started** in this repo — no ingestion, schemas, or APIs for suburb/property market data |
| **Report export** | Button labelled “Export report (coming soon)” |
| **Budget 2026 legislative edge cases** | Pensioner CGT floor carve-out; SMSF/trust; BTR exemptions; ATO CPI series; EM-aligned new-build definition; portfolio-level loss pooling |
| **Deal explanation LLM** | Rule-based stub in `lib/dealExplanation.ts` (future API noted in comments) |
| **Design `AppShell`** | Built under `components/design/shell/` but **not** used by `app/layout.tsx` (live nav is `components/nav/Navbar.tsx`) |
| **Saved comparisons deep-link** | Dashboard shows comparison cards; no dedicated comparison viewer route |
| **Product README** | Still stock create-next-app text |
| **Test coverage beyond tax** | No tests for stamp duty, LMI, strategy cascade, auth helpers, or API route |
| **Unrelated tool** | `tools/colesCurrentCategoryExtractor.js` is not part of the product |

---

## App routes

| Path | Role |
|------|------|
| `/` | Marketing / tool hub |
| `/analyse-property` | Deal analyser |
| `/compare-properties` | Side-by-side compare |
| `/strategy` | Strategy form (signed-in) or guest splash |
| `/suburb-intelligence` | Suburb search placeholder |
| `/portfolio` | Manual portfolio holdings |
| `/watchlist` | Watchlist CRUD |
| `/dashboard` | Hub for saved artefacts + portfolio snapshot |
| `/reports/[id]` | Saved report detail |
| `/auth/complete` | Post-magic-link success |
| `/auth/error` | Auth failure UI |

---

## API routes

| Method / path | Role | Auth |
|---------------|------|------|
| `GET /auth/callback` | Exchange PKCE `code` → session; redirect to `/auth/complete` | Public (needs Supabase configured) |
| `POST /api/strategy/generate` | Validate → rate limit → sanitise → archetype → Claude → insert `strategy_reports` | Signed-in user required; 503 if Supabase missing |

No other `app/api/**` routes. No suburb/warehouse data APIs yet.

---

## Supabase tables used

From migrations `supabase/migrations/001_propellect_schema.sql` and `002_strategy.sql`, and app code:

| Table | Purpose |
|-------|---------|
| `waitlist` | Early-access interest (anon insert on magic-link send) |
| `property_reports` | Saved deal analyses (`inputs_json` / `results_json`) |
| `property_comparisons` | Saved A/B comparisons |
| `watchlist_items` | Suburb/property/note watchlist |
| `portfolio_properties` | Manual portfolio holdings |
| `strategy_generations` | Rate-limit ledger (3 / user / 7 days) |
| `strategy_reports` | Persisted strategy input/output |

All user-owned tables use RLS (`auth.uid() = user_id`). Waitlist: anon insert; select intended for service role only (app does not use a service-role client).

---

## Environment variable names only

Do **not** commit real values. Names referenced by the app:

| Name | Required for |
|------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth + persistence |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + persistence |
| `ANTHROPIC_API_KEY` | Strategy Generator (server) |
| `NEXT_PUBLIC_SITE_URL` | Optional — non-Propellect / preview deploys |
| `NODE_ENV` | Dev-only waitlist warning logging |

Without Supabase URL/anon key (or with placeholder values), the app runs in **preview mode**: analyse/compare work without sign-in; strategy stays guest-only / API returns 503.

---

## Known issues / risks

1. **Magic-link host docs vs code:** `.env.example` still emphasises `www.propellect.com.au`; code canonicalises Propellect production to **`https://app.propellect.com.au`**. Supabase redirect allowlist must include the app callback.
2. **PKCE Site URL fallback:** Middleware forwards `/?code=` and `/?error=` to `/auth/callback` when Supabase lands on `/`.
3. **Strategy rate limit burns on Claude failure:** `recordGeneration` runs before `generateStrategy`; failed LLM calls still consume free-tier slots.
4. **Approximate fiscal models:** Stamp duty schedules, LMI, depreciation, and Budget 2026 logic are illustrative; unknown state stamp duty falls back to a flat 4%.
5. **Claude logging:** Server may log response snippets — watch for PII in production logs.
6. **Duplicate nav:** Live `components/nav/Navbar.tsx` vs unused `components/design/shell/*` can drift.
7. **Freemium gating:** With auth configured, core numbers stay visible; advisory “decision” sections blur until sign-in.
8. **No warehouse / market data:** Suburb Intelligence and suburb-suggested assumptions cannot become real without an external data platform.

---

## Recommended next steps — Australian residential property warehouse

The product already has UI hooks (`/suburb-intelligence`, `getSuggestedAssumptionsForSuburb`) but **zero warehouse implementation**. Suggested order of work:

### 1. Define the warehouse scope (before code)
- **Entities:** suburb (ABS/ASGS), state, dwelling type (house/unit), time series (price, rent, yield, vacancy, sales volume, growth).
- **Grain:** suburb × dwelling type × period (month or quarter).
- **Labels:** historical facts only — never forecasts in v1 (matches existing product copy).
- **Licensing:** decide PropTrack / CoreLogic / ABS / council / listing scrapes — commercial terms drive architecture.

### 2. Schema outside the app DB (recommended)
- Keep **user app data** in current Supabase project (`property_reports`, etc.).
- Put market data in a **separate warehouse schema or project** (e.g. `warehouse.*` or dedicated Postgres) with read-only API keys for the Next.js app.
- Avoid stuffing large time series into `property_reports` JSON.

### 3. Ingestion pipeline (batch first)
- Nightly/weekly ETL into staging → validated dims/facts → published views.
- Stable suburb keys (ABS code + name + state) and change-detection for renames.
- Data quality checks: missing periods, outlier yields, duplicate keys.

### 4. Read API for the app
- Add authenticated or public **read-only** routes, e.g. `GET /api/suburb/[state]/[suburb]` returning medians, rent, yield, vacancy, 12m growth.
- Wire `SuburbIntelligenceClient` to replace placeholders.
- Implement `getSuggestedAssumptionsForSuburb` with editable historical bands (not predictions).

### 5. Product integration
- Prefill Analyse/Compare advanced assumptions from warehouse bands.
- Optional: enrich saved reports with suburb snapshot at analysis time (versioned).
- Watchlist suburbs: show latest warehouse metrics on dashboard cards.

### 6. Compliance / trust
- Source attribution on every metric.
- “Historical, not a forecast” disclaimers (already drafted in Suburb Intelligence UI).
- Cache and rate-limit public suburb endpoints; do not expose licensed raw feeds to the browser if contracts forbid it.

### 7. Explicit non-goals for warehouse v1
- No suburb recommendations from Strategy LLM (policy already forbids naming suburbs).
- No automated buy/sell signals.
- No production data migration of user tables as part of warehouse work.

---

## Related docs in repo

- `docs/STRATEGY_BUILD.md` — Strategy Generator source of truth  
- `CHANGES_BUDGET_2026.md` — Budget 2026 tax modelling notes and TODOs  
- `docs/handover/REPO_MAP.md` — folder/file map  

---

## Audit constraints observed

- No app behaviour changes for this audit.  
- No production database access.  
- No secrets or `.env` values printed.  
- Supabase MCP was not authenticated in this environment; tables were mapped from migrations + code only.
