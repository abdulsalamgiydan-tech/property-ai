# Propellect

Propellect is an Australian residential property research and deal-analysis app.
It helps investors analyse individual deals, compare properties, generate investment
strategies, and (in progress) research suburbs and postcodes using free, official data.

Production: https://www.propellect.com.au

## App modules

| Module | Route | Status |
|---|---|---|
| Analyse Property | `/analyse-property` | Live — deal analyser with Budget 2026 tax modelling |
| Compare Properties | `/compare-properties` | Live |
| Strategy Generator | `/strategy` | Live — Claude-powered, rate-limited |
| Dashboard | `/dashboard` | Live |
| Watchlist | `/watchlist` | Live |
| Portfolio | `/portfolio` | Live |
| Reports | `/reports` | Live |
| Suburb Intelligence | `/suburb-intelligence` | UI shell — awaiting warehouse data |

## Tech stack

- **Frontend:** Next.js (App Router), React 19, TypeScript, Tailwind CSS 4, Recharts
- **Backend:** Next.js API routes, Supabase (Postgres, Auth via magic links, RLS)
- **AI:** Anthropic Claude API (Strategy Generator)
- **Testing:** Vitest
- **Hosting:** Vercel
- **Warehouse (in progress):** Postgres schemas (`meta`, `raw`, `staging`, `core`, `mart`, `audit`) in Supabase, fed by free official Australian data sources

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in values from your Supabase project
   (Settings → API). Environment variables used (names only — never commit values):

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY`
   - `NEXT_PUBLIC_SITE_URL` (optional — non-production deploys only)

   Until Supabase variables are set, the deal tools run in preview mode without sign-in.

3. Run the dev server:

   ```bash
   npm run dev
   ```

## Supabase migrations

Migrations live in `supabase/migrations/` and are numbered sequentially:

- `001_propellect_schema.sql` — app tables (waitlist, property_reports, watchlist, portfolio) with RLS
- `002_strategy.sql` — strategy generator tables and rate limiting
- `003_warehouse_foundation.sql` — research warehouse schemas, metadata, geography dimensions, mart placeholders

Workflow: migrations are written as idempotent SQL (`create table if not exists`,
`create schema if not exists`, no destructive drops of tables/data). Apply them to the
linked Supabase project via the SQL editor or the Supabase CLI (`supabase db push`)
**only after review and approval** — never automatically.

## Commands

```bash
npm run dev             # dev server
npm run build           # production build
npm run lint            # eslint
npm test                # vitest
npm run warehouse:check # validate warehouse skeleton files
```

## Research warehouse status

The suburb/postcode research warehouse is under construction (free-data-first,
Australian residential only). Current state:

- **Sprint 0 (done):** repo cleanup, README, `.gitignore` hardening
- **Sprint 1 (done):** warehouse folder skeleton (`warehouse/`), starter metadata/config
  files, migration `003_warehouse_foundation.sql` (schemas + metadata + geography +
  mart placeholder tables), validation script
- **Next sprint (planned):** ABS ASGS geography backbone ingestion — load SAL, POA, SA1–SA4,
  LGA, GCCSA and state dimensions plus ABS correspondence files into `core.dim_geography`
  and the geography bridge tables

See `warehouse/docs/WAREHOUSE_PLAN.md` for the full plan and principles
(missing data stays missing, confidence scoring, approval-gated publication).
