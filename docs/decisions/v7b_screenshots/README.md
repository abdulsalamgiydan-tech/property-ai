# Deal Hunter alpha — journey storyboard (real engine output)

**Honest note on screenshots:** the local headed browser / gstack `/browse` is **unusable in this
Windows environment** (documented in the V6D work), and no live Supabase branch is used here, so
pixel screenshots could not be captured in-session. Live desktop + mobile screenshots are a tracked
follow-up on a Preview deploy (see `V7B_roadmap_V7C_V7D.md`). The storyboard below uses the **real,
deterministic output** of the engine on the labelled replay dataset (profile: max A$900k, deposit
A$400k, growth strategy, ≤ A$600/wk out-of-pocket, house, SA, medium risk) so the journey is
evidence-backed rather than mocked.

---

### 1. Data-source banner (always visible)
> ⚠️ **Replay data.** Listings shown are a labelled synthetic dataset for the alpha — not live market
> listings. Market metrics are real official open data.

### 2. "Your buy box" summary + "How was this built?"
Chips: `≤ A$900,000` · `Deposit A$400,000` · `house` · `SA` · `≤ A$600/wk out-of-pocket` · `Growth-weighted`.
Expanding shows one line per profile answer → its effect (e.g. *States: SA, NSW — only SA is rankable
today; NSW is honestly blocked until its data gates pass*).

### 3. Tabs: **Matches (1)** · Needs review (1) · Excluded (3)

### 4. Matches — ranked feed
| Listing | Deal score | Yield (est) | Weekly cash-flow (est) | Confidence | Why it fits |
|---|---|---|---|---|---|
| **Grange · house** (RPL-0001, A$850k–890k) | **62.5** (moderate) | 3.11% | −A$151/wk | 100% | "Within your buy box: house in Grange, A$870,000." + suburb growth 6.00% (SA-VG · 2026-06-30) |

### 5. Needs review
| Listing | Deal score | Confidence | Why review |
|---|---|---|---|
| **Belair · house** (RPL-0002, "Contact Agent") | 56.9 | 60% | Price undisclosed → affordability un-gated, **no invented price**, no cash-flow estimate. Verify: ask agent for a price guide. |

### 6. Excluded — hard gates never hidden (the money shot)
| Listing | Raw score | Excluded because |
|---|---|---|
| **Seaton · unit** (RPL-0003) | **82.7** | `property_type_excluded` — **a top score does NOT rescue a wrong-type listing.** |
| Grange · house (RPL-0005, A$1.20M) | 45.2 | `above_price_budget` |
| Unley · house (RPL-0004, A$1.65M) | 41.5 | `above_price_budget`, `exceeds_holding_budget` |

> Seaton scoring **82.7** yet sitting in *Excluded* is the core guarantee in action: hard gates are
> applied before weighting, so a strong weighted score can never hide a gate failure.

### 7. Listing card actions
`Details & brief` · `Save to review` · `Due diligence` · `Pass…` (reveals **required** rejection reasons:
too expensive / poor cash-flow / wrong location / too small / condition-or-risk / low-confidence / other)
· `Compare`.

### 8. Deal-detail drawer / one-page Deal Brief (Grange)
Header: *Grange · house · 12 Main St, Grange SA 5022*. `Deal score 62.5 (moderate) · confidence 100% · deal_score_v1`.
- **Why it fits** — in buy box; suburb growth 6.00% (SA-VG · 2026-06-30).
- **Why it may not** — modelled A$151/wk out-of-pocket (limit A$600/wk).
- **Financials (modelled)** — each row labelled: Advertised price `[listing fact]`, Gross yield 3.11%
  `[estimate]`, Weekly cash-flow −A$151 `[estimate]`, Interest rate 6.2% `[your input]`.
- **Market evidence** — median rent A$520 `[market evidence · SA-VG · 2026-06-30]`, growth 6.00% `[market evidence]`.
- **What could kill the deal** — building & pest / strata / finance not modelled.
- **What to verify next** — inspect in person; independent valuation + legal review.
- Disclaimer: *evidence, scenarios and verification actions — not financial, legal, lending or tax advice.*

### 9. Compare (up to 3)
Side-by-side: suburb · price · deal score · confidence · yield · weekly cash-flow · eligible.

### 10. Pipeline states
`New → Reviewing → Due diligence → Rejected → Offer considered` (per-user, RLS; a rejected item **must**
carry a reason — DB-enforced).

### 11. "Suggested tweaks to your buy box" (feedback loop)
After ≥2 "too expensive" passes: *"You passed 2 listings as too expensive — consider lowering your price
ceiling ~10% (maxPrice: A$900,000 → A$810,000)."* **Proposals only — nothing changes until you edit your
profile. We never silently re-rank.**

---
All figures above are the deterministic output of `rankDeals` / `buildDealBrief` on the replay dataset;
re-running yields identical values (asserted in `lib/dealhunter/dealhunter.test.ts`).
