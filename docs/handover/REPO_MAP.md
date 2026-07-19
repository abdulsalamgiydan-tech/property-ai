# Propellect — Repository Map (Handover)

**Audit date:** 2026-07-19  
Companion to `docs/handover/CURRENT_STATE.md`. No secrets; env **names** only.

---

## Top-level layout

```
/
├── app/                    # Next.js App Router (pages + API)
├── components/             # React UI by feature
├── lib/                    # Domain logic, auth, Supabase, tax, strategy
├── supabase/migrations/    # SQL schema + RLS
├── docs/                   # Product/build docs + handover/
├── tools/                  # Unrelated helper scripts (not product)
├── public/                 # Static assets (default Next SVGs)
├── middleware.ts           # Auth session refresh + auth URL rescues
├── package.json            # Scripts: dev, build, start, lint, test
├── .env.example            # Env var names (no secrets)
├── CHANGES_BUDGET_2026.md  # Budget 2026 change log
└── README.md               # Still stock create-next-app (not product docs)
```

---

## `app/` — routes

### Pages (`page.tsx`)

| Path | File | Notes |
|------|------|--------|
| `/` | `app/page.tsx` | Landing / tool cards |
| `/analyse-property` | `app/analyse-property/page.tsx` | → `AnalysePropertyClient` |
| `/compare-properties` | `app/compare-properties/page.tsx` | → `ComparePropertiesClient` |
| `/strategy` | `app/strategy/page.tsx` | Server session check → client or guest splash |
| `/suburb-intelligence` | `app/suburb-intelligence/page.tsx` | Placeholder suburb UI |
| `/portfolio` | `app/portfolio/page.tsx` | Portfolio CRUD |
| `/watchlist` | `app/watchlist/page.tsx` | Watchlist CRUD |
| `/dashboard` | `app/dashboard/page.tsx` | Saved work hub |
| `/reports/[id]` | `app/reports/[id]/page.tsx` | Saved report viewer |
| `/auth/complete` | `app/auth/complete/page.tsx` | Post-login success |
| `/auth/error` | `app/auth/error/page.tsx` | Auth errors |

### Layout / providers

| File | Role |
|------|------|
| `app/layout.tsx` | Root layout, Geist fonts, `Navbar`, Analytics |
| `app/providers.tsx` | Wraps `AuthProvider` |
| `app/globals.css` | Global styles / animations |

### Route handlers (`route.ts`)

| Path | File | Role |
|------|------|------|
| `GET /auth/callback` | `app/auth/callback/route.ts` | PKCE code exchange |
| `POST /api/strategy/generate` | `app/api/strategy/generate/route.ts` | Strategy generation pipeline |

---

## `components/` — UI by feature

| Folder | Purpose |
|--------|---------|
| `analyse/` | Deal analyser client + save button |
| `compare/` | Dual-form compare UI, charts, form hooks |
| `strategy/` | Form, result cards, markdown, guest splash |
| `suburb/` | Suburb Intelligence placeholder |
| `portfolio/` | Portfolio tracker UI |
| `watchlist/` | Watchlist UI |
| `reports/` | Saved report detail (export stub) |
| `dashboard/` | Dashboard hub |
| `auth/` | AuthProvider, early-access modal, gated blur/unlock |
| `nav/` | **Live** global navbar (`Navbar.tsx`) |
| `design/` | Design system primitives + unused `shell/` |
| `ui/` | Small shared controls (e.g. `InfoButton`) |

**Design system note:** Prefer importing from `components/design/` for new UI. Live shell still uses `components/nav/Navbar.tsx`; `components/design/shell/AppShell` is exported but not wired into `app/layout.tsx`.

---

## `lib/` — domain and infrastructure

### Deal engine

| File | Role |
|------|------|
| `propertyAnalysis.ts` | Core analyse: stamp duty, LMI, cashflow, score, tax hooks, CGT optional |
| `projections.ts` | Value/mortgage/cashflow series; Budget 2026 FY cashflow + carry-forward |
| `analysePropertyForm.ts` | Form parsing → analysis inputs |
| `investmentStrategy.ts` | Growth / balanced / yield score weights |
| `advisoryInsights.ts` | Rule-based advisory bullets |
| `dealCopy.ts` / `dealExplanation.ts` | Status copy; explanation stub |
| `comparePropertyInsights.ts` | Compare winners + insight text |
| `keySnapshotDisplay.ts` | Snapshot column helpers |
| `formatCurrency.ts` | AUD formatting |
| `suburbAssumptions.ts` | **Stub** — always `null` until warehouse |
| `constants/au.ts` | AU states list |

### Tax — Budget 2026 (`lib/tax/`)

| File | Role |
|------|------|
| `budget2026TaxModel.ts` | Entry / assumptions / TODOs |
| `budget2026Constants.ts` | Cut-off dates, rates |
| `budget2026Scenario.ts` | Grandfathered / post-budget established / new build |
| `budget2026FinancialYear.ts` | FY helpers |
| `budget2026AnnualTaxImpact.ts` | Ring-fence / salary interaction |
| `budget2026Cgt.ts` | CGT apportionment, indexation, 30% floor |
| `budget2026Cpi.ts` | Simplified CPI helper |
| `budget2026.test.ts` | Vitest suite (primary automated coverage) |

### Strategy (`lib/strategy/`)

| File | Role |
|------|------|
| `strategyInput.ts` / `strategyOutput.ts` | Zod schemas |
| `archetypes.ts` | 12 archetypes + deterministic cascade |
| `systemPrompt.ts` | Claude system prompt |
| `claudeClient.ts` | Anthropic Messages API client |
| `rateLimit.ts` | 3 gens / 7 days via `strategy_generations` |
| `sanitiseUserText.ts` | Prompt-injection hygiene |

### Auth (`lib/auth/`)

| File | Role |
|------|------|
| `access.ts` | `hasFullToolAccess` (preview vs signed-in) |
| `afterSignup.ts` | Waitlist insert on OTP send |
| `magicLinkRedirectOrigin.ts` | Canonical `app.propellect.com.au` redirect origin |
| `safeNextPath.ts` | Open-redirect hardening for `next=` |
| `supabaseAuthFailureRedirect.ts` | Map error query URLs → `/auth/error` |
| `toolDraftStorage.ts` | localStorage draft keys |

### Supabase (`lib/supabase/`)

| File | Role |
|------|------|
| `env.ts` | `isSupabaseConfigured()` |
| `client.ts` | Browser client |
| `server.ts` | Server/cookie client |
| `reports.ts` | `property_reports` CRUD |
| `comparisons.ts` | `property_comparisons` CRUD |
| `watchlist.ts` | `watchlist_items` CRUD |
| `portfolio.ts` | `portfolio_properties` CRUD |

---

## `supabase/migrations/`

| File | Tables |
|------|--------|
| `001_propellect_schema.sql` | `waitlist`, `property_reports`, `property_comparisons`, `watchlist_items`, `portfolio_properties` (+ `set_updated_at`) |
| `002_strategy.sql` | `strategy_generations`, `strategy_reports` |

RLS enabled on all listed tables. No warehouse / market-data migrations exist.

---

## Middleware

`middleware.ts`:

1. Redirect `/` + `code`/`error` query → `/auth/callback`
2. Redirect Supabase auth failure query params → `/auth/error`
3. If Supabase configured: refresh session cookies via `@supabase/ssr`

---

## Environment variable names

| Name | Where used |
|------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/*`, `middleware.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same |
| `ANTHROPIC_API_KEY` | `lib/strategy/claudeClient.ts` |
| `NEXT_PUBLIC_SITE_URL` | `lib/auth/magicLinkRedirectOrigin.ts` (optional) |
| `NODE_ENV` | `lib/auth/afterSignup.ts` (dev logging only) |

See `.env.example` for setup comments (no real secrets in repo).

---

## Docs

| Path | Content |
|------|---------|
| `docs/STRATEGY_BUILD.md` | Strategy feature build spec |
| `docs/handover/CURRENT_STATE.md` | Completeness, issues, warehouse next steps |
| `docs/handover/REPO_MAP.md` | This file |
| `CHANGES_BUDGET_2026.md` | Budget 2026 modelling notes |

---

## Scripts / tooling

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next dev server |
| `npm run build` / `start` | Production build/serve |
| `npm run lint` | ESLint |
| `npm test` | Vitest (`lib/tax/budget2026.test.ts`) |

`tools/colesCurrentCategoryExtractor.js` — unrelated; ignore for Propellect product work.

---

## Persistence map (quick)

```
Analyse save          → property_reports
Compare save          → property_comparisons
Watchlist             → watchlist_items
Portfolio             → portfolio_properties
Strategy generate     → strategy_generations + strategy_reports
Magic-link interest   → waitlist
Drafts (unsigned)     → localStorage (not Supabase)
```

---

## Suggested reading order for a new engineer / ChatGPT session

1. `docs/handover/CURRENT_STATE.md`  
2. This map  
3. `lib/propertyAnalysis.ts` + `lib/projections.ts` + `lib/tax/*`  
4. `docs/STRATEGY_BUILD.md` + `lib/strategy/*` + `app/api/strategy/generate/route.ts`  
5. `supabase/migrations/*` + `lib/supabase/*`  
6. `components/suburb/SuburbIntelligenceClient.tsx` + `lib/suburbAssumptions.ts` (warehouse extension points)
