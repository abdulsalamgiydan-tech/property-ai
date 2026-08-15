# V8 — Abdul's decision recommendations (consolidated)

Australian English. Companion to `../abdul_decisions.md` (kept consistent). **Recommendations are proposals, not
facts.** I have **not** invented the entity/ABN/contact — those stay placeholders. This file resolves the *modelled*
inputs as far as evidence allows and states exactly what Abdul must confirm before **provider outreach** (the
manual‑entry beta needs none of this).

## The six inputs — status & recommendation
| # | Input | Status | Recommendation (proposal) |
|---|---|---|---|
| 1 | **Legal entity** `[LEGAL_ENTITY]` | **placeholder — Abdul must supply** | your registered trading entity's exact name |
| 2 | **ABN** `[ABN]` | **placeholder — Abdul must supply** | the 11‑digit ABN of #1 |
| 3 | **Contact** `[CONTACT_NAME]`/`[CONTACT_EMAIL]` | **placeholder — Abdul must supply** | you + a business‑domain email |
| 4 | **Pilot user count** `[PILOT_USER_COUNT]` | **recommended** | **cap at 25** (matches beta design; enough signal, small enough to support personally) — raise only if activation demand clearly exceeds supply |
| 5 | **Monthly listing/analysis volume** `[ESTIMATED_MONTHLY_LISTING_VOLUME]` | **modelled (Low/Base/High)** | **Low ~1,000 · Base ~2,000 · High ~3,500** reads/month for ≤25 users (a handful of analyses each); refine from real beta usage before quoting a provider |
| 6 | **Commercial model** `[PROPOSED_COMMERCIAL_MODEL]` | **recommended experiment** | **freemium → Pro at a hypothesised A$19/mo**, with a **per‑report ($15)** parallel probe (see `business_model_and_unit_economics.md` §F) — a *hypothesis to validate*, not a set price |

## First commercial‑model experiment (recommended)
Freemium with a **Pro tier ≈ A$19/month** (unlimited Deal Briefs + saved buy box + compare); free tier = limited
briefs/month. Validate via day‑30 survey + interviews (Van Westendorp‑lite; test $9/$19/$29 + per‑report $15).
**Do not announce a final price during the beta.**

## Provider outreach order (recommended)
**Domain → PropTrack → Cotality** (see `provider_negotiation_strategy.md`). Domain first (self‑serve sandbox,
webhooks, attributed display); PropTrack parallel fallback + AVM; Cotality enrichment/score‑only only.

## What Abdul MUST confirm before any provider outreach
1. `[LEGAL_ENTITY]`, `[ABN]`, `[CONTACT_NAME]`/`[CONTACT_EMAIL]` (real values).
2. Approve the **pilot cap** (default 25) and the **volume figures** (or adjust).
3. Approve the **commercial‑model experiment** framing (freemium → $19 Pro hypothesis).
4. Approve **which providers** to contact and **that the drafts may be sent** (they're currently **unsent**).

## What Abdul does NOT need to decide to run the beta
Nothing above blocks the **manual‑entry founding beta** — it runs on user facts + open data with **zero** provider
dependency. The six inputs gate **commercial outreach and any paid launch**, not the beta.

## Consistency note
These recommendations mirror `../abdul_decisions.md`. If either is edited, update both. Legal entity/ABN/contact
remain **placeholders** everywhere until supplied — never silently filled.
