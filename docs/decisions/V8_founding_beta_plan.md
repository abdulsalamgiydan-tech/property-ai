# V8 — SA Founding Beta: 30-day operating plan

**Goal:** validate that SA investors will complete a buy box, bring their own deals, and find the
analysis useful enough to pay for — with **25 invited SA investors** over 30 days. Invite-only
(`BYOD_FOUNDING_BETA_ENABLED=true` + `FOUNDING_BETA_EMAILS`), on the isolated Preview/beta, Production
untouched. No fabricated data; every figure labelled by source.

## Cohort & timeline
- **25 SA investors**, recruited from existing waitlist + direct outreach. Target ≥15 activated
  (complete a buy box) — activation is the primary funnel gate.
- **Week 0 (setup):** enable flag + allowlist on the beta; seed onboarding email + 10-min Loom.
- **Week 1 (activate):** onboard in 2 waves of ~12; goal = buy box + first Bring Your Own Deal each.
- **Weeks 2–3 (use):** weekly "bring a deal you're actually considering" nudge; capture feedback.
- **Week 4 (decide):** willingness-to-pay conversation + pricing test; write the go/no-go memo.

## Metrics, targets & how each is measured (no new fabrication)
| Metric | 30-day target | Source of truth |
|---|---|---|
| Buy-box completion | ≥ 15 / 25 (60%) | `investment_profiles` rows per invited user |
| Properties submitted (BYOD) | ≥ 40 total | `byod_submissions` count |
| Properties analysed | ≥ 60 total | analyse events (add `deal_listing_feedback` kind on analyse) + `byod_submissions` |
| Saves | ≥ 30 | `deal_pipeline_items` (status reviewing/due_diligence/offer_considered) + feedback kind `saved` |
| Comparisons | ≥ 15 sessions | `deal_listing_feedback` kind `compared` |
| Deal Briefs generated | ≥ 40 | `deal_listing_feedback` kind `brief_opened` |
| 7-day return rate | ≥ 40% | `auth.sessions` / `last_sign_in_at` within 7 days of activation |
| Recommendation usefulness | ≥ 4.0 / 5 mean | in-app 1-question survey → `user_feedback` |
| Willingness to pay | ≥ 40% "yes, at $X" | Week-4 WTP prompt (Van Westendorp-lite) → `user_feedback` |
| Rejection reasons | ranked distribution | `deal_pipeline_items.rejection_reason` + feedback `reason` |

**Instrumentation to add (small, tracked):** emit a `deal_listing_feedback` signal on analyse (`kind`
extended or reuse `brief_opened`), compare (`compared`) and save (`saved`) so the funnel is measurable
from owned, RLS-protected tables — no third-party analytics of listing content. A read-only weekly
metrics query (service-role, aggregate counts only) produces the dashboard.

## Weekly cadence
- **Mon:** pull the metrics query; update the funnel board (activation → submit → analyse → save → return).
- **Wed:** 3 × 20-min user calls (rotate cohort); log verbatim quotes + top friction.
- **Fri:** ship ≤1 proven P0/P1 fix from the week; send the cohort a "what changed" note.

## Success / go-no-go (end of 30 days)
- **Green (build V8.1 + start paid conversion):** ≥60% activation, ≥40% 7-day return, usefulness ≥4.0,
  ≥40% WTP at a viable price.
- **Amber (extend beta 30 days, fix top-2 frictions):** activation 40–60% OR return 25–40%.
- **Red (re-scope):** activation <40% or usefulness <3.0 — revisit the core value prop before spend.

## Risks & guardrails
- BYOD depends on the user selecting the correct suburb/geography; beta limits suburbs to seeded SA set
  (expand as official coverage grows) — communicated up-front, never faked.
- Live listing data is NOT used (manual entry only) until a provider licence is signed — keeps the beta
  legal and honest; the provider package (Part 4) runs in parallel.
- All beta data lives on an isolated branch; Production and the live V6D beta are untouched.
