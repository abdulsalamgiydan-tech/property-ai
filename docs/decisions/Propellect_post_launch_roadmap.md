# Propellect — post-launch roadmap (SA Beta → national, staged)

Framing: ship the **SA-only** Find My Investment Beta, learn fast, then earn each expansion behind explicit coverage/licence/quality gates. **Never claim Australia-wide** until per-state gates pass. Evidence-first: no synthetic customer numbers; AI explains, never generates figures or source claims.

## V6E — SA Beta operations (first 24h / 72h / 14d)
- **24h:** watch auth success rate, `/api/investment/*` error rate, persistence correctness (zero-row false-success = 0), advisor state, deployment health. **Rollback thresholds:** auth success < 95%, API 5xx > 2%, any RLS/ownership leak, any zero-row false success, or a data/ranking checksum drift → re-promote warm deployment.
- **72h:** funnel instrumentation live — questionnaire start → results → drawer open → save profile → shortlist → return visit. First qualitative feedback loop (in-product prompt + a short form). Confirm SA coverage/freshness stable.
- **14d:** cohort retention (D1/D7), activation (share of visitors who save a profile or shortlist ≥1), and the first conversion signal. Decide: hold, iterate, or open the next gate.
- Instrumentation: privacy-safe event stream (no PII in analytics), tied to the existing warehouse quality/freshness monitors.

## V7 — depth for the engaged saver (retention)
Saved **strategies** (named profiles already shipped → add versioning + "what changed"), **watchlists** with change events on shortlisted suburbs, **scenario comparison** (side-by-side saved searches), **explainable recommendation changes** ("moved up because 12-month growth rose, source/period"), **notes** per suburb, and **finance sensitivity** (rate/deposit/holding sliders re-running the tested cash-flow engine). All server-backed, RLS-scoped, deterministic.

## V8 — data trust + expansion readiness (defensibility)
Freshness/coverage **monitoring dashboards** per metric/state; **anomaly detection** on official feeds (sudden shifts flagged, quarantined not shown); **licensing/cost controls** (per-provider budget caps, redistribution-rights enforcement via the provider registry); and **measurable state-expansion gates** — a state becomes rankable only when price+rent+yield+volume+growth are present, fresh, and redistribution-cleared for a material suburb universe. NSW/VIC unlock here, not before.

## V9 — property-level assessment (widen the job)
From suburb → **property-level** assessment: comparables, financing scenarios (reusing the deal engine), risk factors, and exportable **due-diligence packs**. Bridges the existing per-deal analyser with the opportunity engine. Licensed property data required → gated behind V8 licence controls.

## V10 — Investment Copilot (approval-controlled)
Continuous **re-ranking** as data refreshes, **alerts** on shortlisted suburbs, plain-English **explanations** with provenance, full **audit history**, and **reversible** actions — all **approval-controlled** (the Copilot proposes; the user approves; every action is logged and undoable). AI never emits a figure or source claim; it narrates deterministic engine output.

## Commercial strategy
- **Free vs premium:** free = signed-out results + a capped number of saved profiles/shortlist items + the evidence drawer. Premium = unlimited saves, watchlists/alerts (V7/V10), scenario comparison, property-level packs (V9), and export.
- **First pricing experiment:** a single monthly premium tier gated on the highest-intent action (saving/comparing). Measure paywall view → trial → paid.
- **Conversion / retention / referrals:** activation = save/shortlist; retention = return + watchlist engagement; referral = share a shortlist/comparison (privacy-safe public view of aggregate metrics only).
- **Operating-cost gates:** licensed-feed spend must stay within a set annual budget with per-provider caps; a state doesn't expand if its data cost exceeds its projected contribution.

## Closing calls
- **Five highest-leverage post-launch actions:** (1) funnel + activation instrumentation; (2) watchlist + change-alerts on shortlisted suburbs; (3) freshness/coverage monitoring surfaced to users as a trust signal; (4) the first paywall experiment on save/compare; (5) close the V6C.1 real signed-in browser E2E in the V6D live UAT and keep it in CI as a smoke test.
- **Strongest commercial experiment:** premium on unlimited saves + alerts, priced against a single high-intent moment (comparison).
- **One defensible big bet:** the provenance-first, deterministic, explainable opportunity engine + provider-neutral licence-aware data spine — a trust moat competitors relying on opaque AVMs can't easily copy.
- **One tempting feature NOT to build yet:** a generative "AI advisor" chat that emits prices/recommendations — it breaks the never-fabricate rule and the trust moat; defer to the approval-controlled Copilot (V10) that only narrates engine output.
- **State-by-state expansion gates:** SA (live), then any state only when price+rent+yield+volume+growth are present, fresh, redistribution-cleared, and cost-justified. **No nationwide claim until every offered state passes.**
