# V8 — Provider decisions required (internal, once responses arrive)

The internal choices Propellect must make **after** provider answers land. Each is a decision Abdul owns; the
"proposed default" is a recommendation, **not** a commitment. Nothing here reflects an existing agreement.

| # | Decision | Trigger (what we learn) | Proposed default (validate) | Owner |
|---|---|---|---|---|
| 1 | **Primary listings provider** | Domain vs PropTrack answers to the pivotal free‑vs‑paid question + cost | **Domain** (self‑serve sandbox, webhooks, attributed display) | Abdul |
| 2 | **Enrichment provider (score‑only)** | Whether PropTrack AVM and/or Cotality permit non‑display internal use | **PropTrack AVM first**, Cotality only if terms allow | Abdul |
| 3 | **Free‑vs‑paid boundary** | Written answer to the pivotal question | Listing/agent/price **free + attributed**; derived analysis **paid** | Abdul |
| 4 | **Cache/retention policy** | Provider's permitted TTL + delete‑on‑termination | Shortest TTL that renders a feed + brief; auto‑purge on expiry/termination | Abdul + eng |
| 5 | **SA pilot scope & volume** | Provider min tier + pricing | Smallest tier fitting `[ESTIMATED_MONTHLY_LISTING_VOLUME]` | Abdul |
| 6 | **Go / no‑go to live listings** | All of the above vs budget | Proceed only if pivotal = yes **and** cost within budget; else **stay on manual BYOD + synthetic** | Abdul |
| 7 | **National expansion** | Coverage + per‑state cost gates | Defer until SA proves out and each state's data gate + cost pass | Abdul |

## Decision rule (proposal)
- Domain confirms pivotal **+** SA cost within budget → **sign Domain, build compliant SA pilot**.
- Domain "no" but PropTrack "yes" → **switch primary to PropTrack**.
- Both "no" → **do not sign**; continue V8 BYOD on **manual user‑entered facts + labelled synthetic data**;
  revisit later. **No scraping under any branch.**

## Hard constraints that do not change with any answer
No scraping; a trial ≠ production rights; no client‑side provider secrets; strict labelling of user‑fact /
official / derived / estimate; nothing presented as licensed data unless a signed licence exists.
