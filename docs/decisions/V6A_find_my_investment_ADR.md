# ADR V6A — Find My Investment / Opportunity Engine

Status: **Draft (local vertical slice)** · Baseline: `main@8069b9f` · Scope: local dev, feature branch, draft PR only. No merge/deploy/Production/validation/Vercel/vendor actions.

## Context

Propellect today presents **suburb information** (the Research Hub suburb snapshot,
`get_market_snapshot_v2`, and the official SA/VIC metrics via
`get_official_suburb_metrics_v1`) and a **per-deal** analyser
(`lib/propertyAnalysis.ts` → `combineDealModelScore`, bands at 55/35). Neither
answers the question a buyer actually asks:

> "Given my situation and strategy, where should I consider investing — and why?"

V6A builds a real end-to-end vertical slice that ranks **suburbs** for a specific
user profile, using **only currently accepted evidence** (official SA CC-BY data),
with a new, separately versioned suburb-level score. It must not describe Propellect
as Australia-wide, and must honestly block national ranking until a coverage gate is met.

## Decisions

### D1 — New score, separately versioned; existing scores untouched
`opportunity_score_v1` is a **new suburb-level** score defined in
`lib/opportunity/opportunityScoreV1.ts` and specified in
`docs/scoring/opportunity_score_v1.md`. It does **not** replace or reuse the deal
score (`combineDealModelScore`) or its 55/35 bands. The deal analyser is unchanged.
The version suffix (`_v1`) is carried in the code module, the consumer RPC name, the
spec doc, and every result payload (`score_version: "opportunity_score_v1"`), so a
future `_v2` can coexist and be A/B compared, never silently swapped.

### D2 — Three separate concepts, never blended
- **Affordability fit** — does the suburb's median price fit the user's max price +
  deposit + acceptable weekly holding cost? A hard filter + a 0–100 fit signal.
- **Opportunity score** — strategy-weighted 0–100 over a **fixed** set of evidence
  dimensions. Reflects the *quality of the opportunity*, not data completeness.
- **Data confidence** — a separate 0–100 axis over freshness, sample size and
  optional-evidence coverage. Reflects *how much we trust the inputs*, not how good
  the suburb is.

These are displayed and stored separately. Confidence never lifts opportunity;
opportunity never lifts confidence.

### D3 — Missing data is never zero, and never helps
- **Mandatory dimensions** (see spec) must be present **and fresh** or the suburb is
  **excluded** from ranking (eligibility gate), never ranked low. Exclusion is
  surfaced honestly as "insufficient evidence", not as a poor result.
- **Optional dimensions** (e.g. demographics) only lower **confidence** when missing;
  they never enter `opportunity_score_v1`, so a missing optional metric can neither
  raise nor lower the opportunity rank.
- Because every eligible suburb carries the **same** mandatory basis, the opportunity
  score is **not renormalised over a variable set** — so "missing evidence cannot
  improve a result" holds by construction (Assurance A3).

### D4 — Deterministic, testable, explainable
The engine is a pure function of `(profile, candidate rows)`. No randomness, no
time-of-day dependence beyond an explicit `asOf` freshness input, no floating tie
noise (integer scores + a documented deterministic tie-break). Every sub-index,
weight, and reason is unit-tested. Every displayed figure carries `source_id`,
`period_start/period_end`, `retrieved_at`, and `direct|derived` provenance from the
RPC row it came from (Assurance A6).

### D5 — AI explains, never generates numbers
Prices, rents, yields, growth rates, and source claims come **only** from the
warehouse via the consumer RPC. The engine computes scores/scenarios
deterministically. Any AI copy layer (reused `lib/strategy` pattern) may only
**re-phrase structured, already-computed results** and is given no capability to emit
a figure or a source claim. Cash-flow outputs are labelled **scenarios**, not advice.

### D6 — Provider-neutral data architecture (official today, Domain/PropTrack/Cotality-ready)
Four separated layers (see `docs/data/provider_neutral_contract.md`):
1. **Source ingestion** — existing per-provider adapters (`warehouse/adapters/*`).
2. **Canonical metrics** — `core.official_observation` today; a provider-neutral
   `meta.metric_provider` registry classifies each source's licence
   (`open_cc_by` vs `licensed_restricted`) and a precedence rank.
3. **Scoring inputs** — `mart.suburb_scoring_input_v1` (internal) assembles one row
   per (geography, property_type) from **accepted** providers, applying precedence
   and conflict rules; carries full provenance.
4. **Consumer output** — least-privilege `get_investment_candidates_v1` RPC exposes
   only the scoring inputs + provenance for **eligible** suburbs. Internal/vendor rows
   stay inaccessible to client roles (schemas `core`/`mart`/`meta` remain revoked).

The engine consumes the RPC's neutral shape, so adding Domain/PropTrack/Cotality is a
registry + ingestion change, **not** an engine change. Licensed rows are gated behind
a `licence_class` flag and are not exposed or redistributed without confirmed rights.

### D7 — SA-only vertical slice; national honestly blocked
The slice ranks only **eligible SA suburbs** built from currently accepted official
CC-BY evidence. No fixtures or synthetic values reach customer-facing results. A
**national coverage gate** (`docs/data/provider_neutral_contract.md#coverage-gate`)
must be met per state before that state can be ranked; until then the UI blocks
national ranking with an honest "coverage not yet available" state. The product never
implies Australia-wide coverage.

## Component inventory (built in this slice)
- Onboarding questionnaire, ranked-results screen, explanation/evidence drawer,
  shortlist + comparison, and empty / insufficient-evidence / stale-data states.
- Mobile + desktop behaviour; keyboard and screen-reader support.
- Research Hub, Explore, Map, Compare, authentication, and existing Production
  behaviour are **preserved** (no changes to their code paths).

## Consequences
- A new `_v1` score and RPC to maintain, versioned independently of the deal score.
- Eligible SA universe is intentionally small (intersection of price + rent + yield +
  volume + growth). That is the honest cost of "never fabricate data".
- National launch is explicitly deferred behind the coverage gate and licensed-feed
  confirmation (tracked in the data contract).

## Links
- Scoring spec: [`docs/scoring/opportunity_score_v1.md`](../scoring/opportunity_score_v1.md)
- Data contract: [`docs/data/provider_neutral_contract.md`](../data/provider_neutral_contract.md)
- Migration: `supabase/migrations/059_investment_opportunity_engine.sql`
- Engine: `lib/opportunity/*`
