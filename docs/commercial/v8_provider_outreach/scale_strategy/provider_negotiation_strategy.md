# V8 — Provider negotiation strategy (Domain · PropTrack · Cotality)

Australian English. Built on `../provider_research.md` + `../provider_comparison.md`. **All outreach drafts remain
unsent** until Abdul supplies the six inputs and approves. **A provider agreement must not block the manual‑entry
founding beta** — the product ships on user facts + open data regardless.

## Outreach order & why
1. **Domain — first.** Only provider with a **self‑serve sandbox**, **published rate limits**, **lifecycle
   webhooks**, and **explicit attributed‑display permission** → fastest to a compliant, attributed pilot.
2. **PropTrack — in parallel** as fallback listings + preferred **AVM/enrichment** (REA‑grade depth; slower —
   account‑manager gated).
3. **Cotality — last**, and **enrichment / score‑only** (its terms restrict incorporation/redistribution) — pursue
   only if a **non‑display internal** use is permitted.

## Minimum acceptable licensed data scope (for a listings provider)
- Current **SA sale listings** with: address + geocode/precision; property type, beds/baths/parking, land/building
  area; advertised price text + structured bounds + price‑visibility flag; lifecycle status; provider listing id;
  timestamps. (Media/agent are nice‑to‑have, not minimum.)
- **Rights to:** display (with attribution + link‑back), reasonably **cache** to render a feed + Deal Brief
  snapshot, run **our own calculations/derived scores** on the facts, and **retain our derived output**.

## Critical contract questions (get in writing)
1. **Pivotal:** may our **derived** analysis be **paid** while listing/agent/price stay **free + attributed**?
2. Are **Propellect‑computed** scores/estimates (distinct from your AVM) permitted?
3. Permitted **cache TTL** for a feed + brief snapshot vs delete/destroy‑on‑termination.
4. May we **retain our derived output** after a source listing is withdrawn?
5. Exact **attribution / link‑back / no‑index / event‑reporting** requirements.
6. **Smallest tier**, minimum commitment, liability cap, ABN steps, and indicative **pricing** (SA‑now / national‑later).
7. **Sandbox/test** access (a trial ≠ production authorisation).

## Rights map (what we need, by activity)
| Activity | Right needed |
|---|---|
| Show a listing in a Deal Brief | **display + attribution + link‑back** |
| Keep it to render a feed/brief | **cache/store** (shortest workable TTL) |
| Compute yield/cash‑flow/fit | **derive calculations** on the facts |
| Show our score/brief | **derived‑output display** (our IP, not your data) |
| Keep our brief after withdrawal | **retain derived output** |
| Enrichment (AVM) confidence | **internal‑only, non‑displayed** use |

## Outcome ladder (per listings provider)
- **Preferred:** written "yes" to the pivotal question + SA sandbox→production path + smallest tier within budget +
  workable cache TTL + retain‑derived‑output.
- **Acceptable:** paid derived analysis allowed with tighter caching/attribution constraints; SA‑only to start;
  modest minimum commitment; enrichment internal‑only.
- **Walk‑away:** listing/agent/price must be paywalled by us; derived scores prohibited; no caching at all; a
  minimum commitment far beyond beta economics; per‑seat pricing that can't pass through a low‑cost SaaS.

## Concessions we can offer (without undermining Propellect)
- Full **attribution + link‑back + UTM + no‑index** on our surfaces.
- **Event reporting** (views/enquiries) back via their API.
- **Shortest workable cache TTL** + auto‑purge + delete‑on‑termination + provider‑directed takedown.
- **SA‑only** start; volume‑capped pilot; named single environment; no onward redistribution.
- We will **not** commercialise or resell raw data — only our derived analysis.

## Concessions we will NOT make
Paywalling the listing/agent/price; scraping; fabricating figures; client‑side provider secrets; any use that
misrepresents licensing status.

## Fallback if no agreement is viable during beta
**Stay on manual‑entry BYOD + labelled synthetic/open data** — the founding beta runs and validates value with
**zero provider dependency**. Revisit a feed at Stage 3 when unit economics (business model §D) justify
`[PROVIDER_COST]`. Alternative lanes to explore later: a licensed **AVM enrichment** (score‑only) even without a
listings feed; a **direct agent/agency feed**; an authorised aggregator. **No scraping under any branch.**

## Status
Drafts prepared and **unsent** (`../domain_enquiry_draft.md`, `../proptrack_enquiry_draft.md`,
`../cotality_enquiry_draft.md`). Blockers to sending: the six inputs (`abdul_decision_recommendations.md`) + Abdul's
approval. No provider has been contacted.
