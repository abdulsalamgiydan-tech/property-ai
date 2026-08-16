# Channel scoring method

Australian English. A **transparent, reproducible** rubric for ranking recruitment channels and partners. Scores
are **judgement calls on public evidence**, not precise measurements — they exist to make the ranking in
`ranked_shortlist.md` auditable and adjustable, not to imply false precision.

## Scoring dimensions (each 1–5; 5 = best)
| Dimension | What it measures | 1 (poor) | 5 (excellent) |
|---|---|---|---|
| **Trust / warmth** | How consent-based and credible the intro is | Cold, unsolicited | Personal, invited, pre-trusted |
| **SA fit** | Concentration of *South Australian* investors | National/diffuse | SA-local, dense |
| **Target-customer fit** | Match to the ICP (active SA investor evaluating a deal) | Wrong audience | Exactly the ICP |
| **Speed** | How fast it can yield activated participants | Slow / gatekept | Same-week |
| **Compliance / low spam risk** | Inverse of anti-spam and reputational risk | High spam/rules risk | Clean, permission-native |
| **Independence** | Freedom from vendor/spruiker/competitor entanglement | Competitor/spruiker-run | Fully independent |

## Weighting (why these weights)
For a **manual-entry, honesty-first, invite-only beta**, trust and compliance matter more than raw reach.

| Dimension | Weight |
|---|---|
| Trust / warmth | **0.25** |
| Target-customer fit | **0.20** |
| SA fit | **0.20** |
| Compliance / low spam risk | **0.15** |
| Speed | **0.10** |
| Independence | **0.10** |

**Weighted score = Σ (dimension score × weight)**, range 1.0–5.0.

## Priority bands (how CSV `priority` maps)
- **P1** — weighted ≥ 4.3 **and** trust ≥ 4: start here (typically internal — network, referrals, waitlist).
- **P2** — weighted 3.7–4.29: strong candidates to seed early.
- **P3** — weighted 3.0–3.69: use with care / permission-led; slower.
- **P4** — weighted 2.3–2.99: opportunistic / later.
- **Avoid (for now)** — weighted < 2.3 **or** a disqualifying independence/spam risk (e.g. spruiker-run) →
  listed in `ranked_shortlist.md` under "Channels to avoid for now."

## Note on internal channels
Abdul's **trusted network**, **Wave-1 referrals**, and the **SA waitlist** are internal (not web-researched) and
are not rows in `recruitment_channels.csv`, but they score highest on this rubric (trust 5, fit 5) and are the
recommended Wave-1 sources — see `founder_sales_playbook.md` and `ranked_shortlist.md`.

## Honesty caveat
"Verified public size" is only recorded where a source **published** it; audience counts behind logins or that
would require scraping are left as "not public / not verified" — never estimated to look precise.
