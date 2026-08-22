# Beta KPI tracker — spec

> Defines the metrics, targets and how each is measured — at the **product/analytics level only** (no internal
> identifiers). A simple weekly sheet is enough for 25 participants. Australian English.

## Funnel (the spine)
`Invited → Accepted → Activated (buy box done) → Submitted a deal → Analysed → Saved/Compared/Brief → Returned (7‑day)`

## Core KPIs, definitions & targets
| KPI | Definition | Target | Cadence |
|---|---|---|---|
| **Activation rate** | Activated ÷ Invited (activated = completed a buy box) | **≥ 60%** | weekly |
| **7‑day return rate** | Participants active again within 7 days of activating ÷ activated | **≥ 40%** | weekly |
| **Usefulness** | Mean of day‑7 Q2 + day‑30 Q1 (1–5) | **≥ 4.0** | day‑7, day‑30 |
| **Willingness‑to‑pay** | Day‑30 "Yes" + "Yes at the right price" ÷ respondents | **≥ 40%** | day‑30 |

## Supporting metrics (diagnose the funnel)
- **Properties submitted** (total + per active participant).
- **Properties analysed** (a Deal Brief produced).
- **Saves**, **comparisons run**, **Deal Briefs generated**.
- **Confirmation‑before‑incomplete rate** (how often participants proceed after the "confirm missing facts"
  prompt) — a UX‑honesty signal.
- **Rejection reasons** distribution (why participants pass on a deal).
- **NPS‑style** advocacy (day‑30 Q8).

## Measurement approach
- Counts come from the product's own participant activity + the two surveys and interviews.
- Keep a per‑participant row (initials only) and a weekly rollup. No names in shared views; anonymised/aggregated
  for any report.
- Do **not** record or expose credentials, tokens, or internal system identifiers in the tracker.

## Weekly board (Mon)
Funnel counts • activation & return vs target • usefulness running mean • top‑3 friction themes
(`feedback_taxonomy.md`) • the one fix shipping Friday.

## Go / no‑go thresholds (end of 30 days)
- **Green** (build v1 + start paid conversion): activation ≥60%, return ≥40%, usefulness ≥4.0, WTP ≥40%.
- **Amber** (extend 30 days, fix top‑2 frictions): activation 40–60% **or** return 25–40%.
- **Red** (re‑scope value prop): activation <40% **or** usefulness <3.0.
