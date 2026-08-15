# V8 SA Founding Beta — overview

**What:** an invite‑only, 30‑day beta of Propellect's **"Bring Your Own Deal"** for up to **25 South Australian
property investors**. A participant enters a property's facts by hand, selects the matching suburb, and receives
a decision‑grade **Deal Brief** scoring it against their saved "buy box" — with every figure labelled by source.

**Why a closed beta:** to validate that SA investors will complete a buy box, bring their own deals, and find the
analysis **useful enough to pay for** — before any spend on licensed data feeds.

## What the product does (and doesn't) in the beta
- **Manual fact entry.** The customer types the address, price, type, beds/baths/parking and status, and pastes
  the listing URL **for reference only**. **Propellect does not scrape** any listing site.
- **Confirmation before scoring incomplete facts.** If material facts are blank, the participant must explicitly
  confirm before a score is produced — we never silently assume.
- **Clear labelling.** Every figure is tagged: **your fact** · **official evidence** · **Propellect estimate** ·
  **assumption** · **missing**.
- **Not a valuation, not advice.** Outputs are **illustrative analysis, not a property valuation and not
  financial, tax or legal advice**. No claim is made that any live listing‑provider data is currently licensed —
  the beta runs on the participant's own facts plus open, labelled market evidence.

## Success targets (30 days)
| Metric | Target |
|---|---|
| **Activation** (invited → completed a buy box) | **≥ 60%** |
| **7‑day return** | **≥ 40%** |
| **Usefulness** (mean rating) | **≥ 4.0 / 5** |
| **Willingness‑to‑pay signal** | **≥ 40%** say "yes, at a price" |

Supporting signals: properties submitted, properties analysed, saves, comparisons, Deal Briefs generated,
rejection reasons. See `beta_kpi_tracker_spec.md`.

## Timeline (30 days)
- **Week 0:** finalise invite list, enable invite‑only access, brief the support playbook.
- **Week 1:** onboard in 2 waves (~12 each); goal = buy box + first "Bring Your Own Deal" per participant.
- **Weeks 2–3:** weekly "bring a deal you're actually considering" nudge; 3 user calls/week.
- **Week 4:** willingness‑to‑pay + pricing‑test conversation; write go/no‑go memo.

## Guardrails
Invite‑only; no scraping; strict source/fact/estimate labelling; no valuation/advice implication; no claim of
licensed live provider data; all beta data on the isolated V8 Preview branch (Codex‑owned) — this kit is
**documentation only** and touches no infrastructure.

## Related
Product: `docs/decisions/V8_bring_your_own_deal_ADR.md`. Provider track: `../../commercial/v8_provider_outreach/`.
Metrics detail: `beta_kpi_tracker_spec.md`. Pricing experiments: `pricing_research_plan.md`.
