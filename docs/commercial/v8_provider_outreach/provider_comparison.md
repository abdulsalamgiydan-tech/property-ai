# V8 — Provider comparison (Domain · PropTrack · Cotality)

**As at 2026‑08‑16.** Decision‑support view. Pricing is **unpublished** for all three (each quotes per‑deal), so
cost rows are ranges / placeholders, never quotes. ✅ documented · ⚠️ constrained · ❌ prohibited · ❓ confirm in
writing. Sources: `provider_research.md`.

## Fit for V8 "Bring Your Own Deal" → licensed listings
| Dimension | **Domain** | **PropTrack (REA)** | **Cotality** |
|---|---|---|---|
| Proposed Propellect role | **Primary listings** | **Fallback listings + AVM/enrichment** | **Enrichment / score‑only** |
| Live SA sale listings | ✅ Agents & Listings API | ✅ Market/Listings (REA) | ⚠️ not the primary listings fit |
| Valuations / AVM | ✅ Price Estimation + Rental AVM | ✅ Valuations Platform + AVM | ✅ AVM / market value |
| Attributes / address | ✅ Properties & Locations | ✅ attributes | ✅ 200M attribute records |
| Images / floorplans | ✅ in feed (event reporting req.) | ❓ | ✅ 950M digital assets (display terms restrictive) |
| Lifecycle webhooks | ✅ Webhooks package | ❓ | ❓ (refresh feed, marketplaces) |
| **Self‑serve sandbox** | ✅ **yes** | ❌ account‑manager | ❌ contract/ABN‑gated |
| Published rate limits | ✅ (prior research) | ❌ | ❌ |
| SA + national coverage | ✅ | ✅ | ✅ (98% of market) |
| Public display allowed | ⚠️ **with attribution + link‑back + no‑index** | ❓ | ❌ **no incorporation/redistribution** |
| Storage / retention | ⚠️ storing discouraged; delete/destroy on termination | ❓ | ⚠️ return/destroy on termination |
| Derived‑score rights | ⚠️ likely, **confirm** | ⚠️ analytics permitted, confirm | ⚠️ internal‑only, **confirm** |
| Onboarding speed | **fastest** | medium | slowest |
| Access URL | developer.domain.com.au | proptrack.com/property-data/property-data-apis/ | cotality.com/au/our-data |
| Contact route | "Contact our team" / self‑serve | "speak to a specialist" | CoreStore + sales 1300 734 318 |

## The single pivotal question (drives the whole decision)
**May Propellect charge for its *derived* analysis (deal‑fit score, cash‑flow scenarios, alerts, Deal Brief)
while keeping the listing display, agent contact and price estimate free and attributed?**
A written "yes" from a listings provider unblocks a compliant live pilot.

## Recommendation (proposal, pending written answers — not an agreement)
1. **Lead with Domain** for listings — only provider with a self‑serve sandbox + published rate limits +
   webhooks + explicit attributed‑display permission; fastest to a compliant, attributed SA pilot.
2. **PropTrack in parallel** as fallback listings and preferred AVM/enrichment.
3. **Cotality** for **score‑only** enrichment **iff** its terms permit a non‑display internal use.
4. **State‑expansion gate:** a state expands only if its licensed‑feed cost stays within budget and is justified
   by projected contribution.

## Decision rule (proposal)
- Domain confirms the pivotal question **+ SA pilot cost within budget** → sign Domain, build compliant SA pilot.
- Domain "no" but PropTrack "yes" → switch primary to PropTrack.
- Both "no" → **stay on manual user‑entered facts (V8 BYOD) + labelled synthetic data**; product still ships;
  revisit licensed listings later. **No scraping, ever.**

**Unresolved before outreach:** `[LEGAL_ENTITY]`, `[ABN]`, `[CONTACT_NAME]`, `[CONTACT_EMAIL]`,
`[PILOT_USER_COUNT]`, `[ESTIMATED_MONTHLY_LISTING_VOLUME]`, `[PROPOSED_COMMERCIAL_MODEL]` — see `abdul_decisions.md`.
