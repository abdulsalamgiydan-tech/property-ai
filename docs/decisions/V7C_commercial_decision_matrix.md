# V7C — Commercial decision matrix (approval + estimated cost)

Side-by-side to drive the provider decision once responses arrive. Pricing is **unpublished** for all
Australian property-data providers (each quotes per-deal), so cost cells are **ranges / [Abdul to confirm]**,
not quotes. Approval columns are the answers we need **in writing** (see the 9 questions in
`V7C_provider_approval_package.md`).

## Fit + role
| | **Domain** | **PropTrack (REA)** | **Cotality** |
|---|---|---|---|
| Proposed role | **Primary listings** | **Fallback listings + enrichment/AVM** | **Enrichment only (score-only)** |
| Self-serve sandbox | ✅ yes | ❌ account-manager | ❌ ABN + approval |
| Published rate limits | ✅ yes | ❌ | ❌ |
| Lifecycle webhooks | ✅ yes | ⚠️ unclear | ❌ (24h refresh) |
| Public display allowed | ✅ with attribution + link-back | ❓ confirm | ❌ (no incorporation/redistribution) |
| SA + national coverage | ✅ | ✅ | ✅ |
| Onboarding speed | **fastest** | medium | slowest |

## Approval questions — expected answer we need (fill on response)
| Question (from the package) | **Domain** | **PropTrack** | **Cotality** |
|---|---|---|---|
| 1. Rank with derived scores | ❓ | ❓ | ❓ (score-only ok?) |
| 2. Combine with public evidence | ❓ | ❓ | ❓ |
| 3. Display financial scenarios | ❓ | ❓ | n/a (no display) |
| 4. **Charge for analysis, listing free** | ❓ **pivotal** | ❓ | n/a |
| 5. Store ids/derived/change history | ❓ (delete-on-termination) | ❓ | ❓ (destroy-on-termination) |
| 6. Cache fields + media refs | ❓ (storing discouraged) | ❓ | ❌ likely |
| 7. Notify on new matches/changes | ❓ | ❓ | ❓ |
| 8. Retain derived output post-withdrawal | ❓ | ❓ | ❓ |
| 9. National under same agreement | ❓ | ❓ | ❓ |

Legend: ✅ yes · ❌ no · ⚠️ conditional · ❓ awaiting written answer.

## Estimated cost (indicative — unpublished; [Abdul to confirm on quote])
| | **Domain** | **PropTrack** | **Cotality** |
|---|---|---|---|
| Model | per-contract, by industry + monthly call volume | subscription/consumption, tiered | contract, ABN-gated |
| Liability cap | A$5,000 (published) | [confirm] | [confirm] |
| Per-seat trap | no (product-level) | no | no (but restrictive terms) |
| SA pilot cost | **[Abdul to confirm quote]** | [confirm] | [confirm] |
| 12-month (multi-state) | **[Abdul to confirm quote]** | [confirm] | [confirm] |
| Pricefinder note | avoid — **per-seat** (A$175+GST/user/mo), can't pass through a SaaS | — | — |

## Recommendation (unchanged from V7B, now decision-framed)
1. **Lead with Domain** for listings (fastest to a working, attributed pilot). The single gating answer is
   **Q4** — can our derived analysis be premium while listing/agent/price stay free? A written "yes" → proceed.
2. **PropTrack in parallel** as fallback listings and preferred **AVM/enrichment**.
3. **Cotality** for **score-only enrichment** if its terms permit a non-display internal use.
4. **Operating-cost gate:** a state only expands if its licensed-feed cost stays within budget and is
   justified by its projected contribution (per the post-launch roadmap).

## Decision rule
- If **Domain Q1–Q4 = yes** and cost within budget → **sign Domain, build live SA pilot**.
- If **Domain Q4 = no** but PropTrack Q4 = yes → **switch primary to PropTrack**.
- If **both Q4 = no** → **stay on labelled replay** (product still ships suburb-level; listings deferred) and
  escalate to a direct feed / authorised aggregator conversation. **No scraping, ever.**
