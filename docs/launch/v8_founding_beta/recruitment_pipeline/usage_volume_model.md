# Usage & volume model (corrected)

Australian English. **Every number here is a labelled hypothesis to validate in the beta — not a fact.** This
model **replaces the ambiguous single "Low ~1,000 · Base ~2,000 · High ~3,500 reads/month" figure** that
previously appeared in `../../../commercial/v8_provider_outreach/abdul_decisions.md` (#5) and
`../../../commercial/v8_provider_outreach/scale_strategy/abdul_decision_recommendations.md` (row 5). Those files
now point here.

## The problem being corrected
The old figure quoted one number as "listing/analysis volume" **and** as "reads/month" — conflating three
different things: **property analyses**, **licensed provider reads**, and **API calls**. That is misleading. In
particular:
- **API calls are not property analyses and are not listings.** One completed analysis triggers *several* backend
  calls; counting calls as analyses over-states activity by roughly an order of magnitude.
- **During the manual-entry beta there are ZERO licensed provider reads** — the beta runs on the participant's own
  typed facts plus open, labelled data, with **no live licensed feed** (`../beta_overview.md`). The ~1,000–3,500
  "reads/month" figure was really a *forward provider-sizing hypothesis* for **if a feed were signed later**, not
  beta consumption.

## Metrics modelled separately (the fix)
Each metric is distinct; do not collapse them.

| Metric | What it is | Low | Base | High |
|---|---|---|---|---|
| **Active users / month** | Invited SA investors who used the tool that month (of ≤25 invited; activation ≥60% target) | 10 | 15 | 22 |
| **Analyses started / active user** | Deal analyses begun (incl. abandoned) | 3 | 7 | 15 |
| **Analyses started / month** | = active users × started per user | **30** | **105** | **330** |
| **Completion rate** | Started → completed (rest abandoned/incomplete) | 67% | 71% | 80% |
| **Analyses completed / active user** | Deal Briefs actually produced (mirrors unit-econ "analyses per active user" 2/5/12) | 2 | 5 | 12 |
| **Analyses completed / month** | = active users × completed per user | **20** | **75** | **264** |
| **Unique properties entered / month** | Distinct addresses typed in (a user re-analyses some; ≈0.8 × started) | 24 | 84 | 264 |
| **Provider lookups / completed analysis** | Licensed reads a completed analysis *would* trigger **if a feed were signed** | 6 | 10 | 14 |
| **Provider lookups / month (LICENSED)** | **In the manual-entry beta = 0.** Forward-sizing only: = completed × lookups per analysis | **0 in beta** (≈150 / ≈750 / ≈3,700 *if* feed signed) | | |
| **Open-data / internal API calls / completed analysis** | Non-licensed backend calls (suburb open-data series, geocode, internal scoring) that *do* happen in the beta | 2 | 4 | 8 |
| **Open-data / internal API calls / month** | = completed × calls per analysis | **≈40** | **≈300** | **≈2,100** |
| **API calls per completed analysis (total non-licensed)** | Backend calls behind one Deal Brief | 2 | 4 | 8 |

## Formula (as specified)
```
provider_reads_per_month (hypothetical, post-feed) = active_users × analyses_completed_per_user × provider_calls_per_completed_analysis
```
Worked (Base): 15 active × 5 completed/user × 10 reads/analysis = **750 licensed reads/month** — *if a feed were
signed*. **During the beta this term is 0** (no licensed feed).

Open-data/internal API load (Base): 15 × 5 × 4 = **300 API calls/month** — these are **API calls, not analyses**.

## What each audience should take from this
- **Beta operations:** expect ~**20–260 completed Deal Briefs/month** across ~**10–22 active users**, on ~**24–264
  unique properties**, with ~**40–2,100 open-data/internal API calls/month** and **zero licensed provider reads.**
- **Provider outreach sizing** (`abdul_decisions.md` #5): to avoid under-provisioning a *future* feed, request a
  tier that comfortably covers the **High** case with headroom — order of **~4,000–5,000 licensed reads/month** —
  while stating plainly that **the beta consumes zero** and real numbers will be refined from beta usage before any
  commitment. Never quote this as current or as "analyses/listings."

## Reconciliation with the old figure
The legacy High "~3,500 reads/month" ≈ this model's post-feed High provider-read estimate (~3,700). So the old
number was, in effect, a **high-end licensed-read estimate mislabelled as listing/analysis volume**. Corrected: it
is one specific, clearly-labelled line (provider lookups / month, **= 0 in the beta**), not a headline for
"analyses."

## Assumptions & honesty guardrails
- Ranges are hypotheses; refine from real beta telemetry (`../beta_kpi_tracker_spec.md`) before quoting any
  provider.
- "Analyses per active user" (2/5/12) is kept consistent with
  `../../../commercial/v8_provider_outreach/scale_strategy/business_model_and_unit_economics.md` §B.
- Provider/data licensing cost is **never $0 at scale** — it is $0 **only** while the manual-entry beta runs; a
  signed feed makes provider reads real and adds per-read or fixed cost (see that file §B/§D).
- No live-licensed-data claim; not a valuation; not financial advice.
