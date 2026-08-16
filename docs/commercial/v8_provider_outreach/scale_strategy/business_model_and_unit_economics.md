# V8 — Business model & unit economics

Australian English. **Every number here is a labelled assumption or hypothesis, not a fact or a committed price.**
Unknown costs (especially provider/data licensing) remain **explicit input variables** — never assumed to be zero.
No claim of licensed live data; the paid value is Propellect's **own derived analysis** on the customer's facts +
open data.

## A. Model options (evaluated)
| Model | Customer appeal | Revenue predictability | Product complexity | Provider‑licensing implication | Support burden | Abuse risk | Conversion friction | Fit for founding beta |
|---|---|---|---|---|---|---|---|---|
| **Monthly subscription** | med‑high (unlimited briefs) | **high** (recurring) | low‑med | licence must permit ongoing derived‑analysis use | med | low‑med (sharing) | higher (pay before value) | good post‑beta |
| **Per‑analysis / report** | high for occasional buyers | low‑med (lumpy) | low | licence per‑use is cleaner | low | low | **low** (pay at value) | good as an early test |
| **Freemium → Pro** | **high** (free first brief) | med (depends on conversion) | med (gating) | free tier must respect "listing/agent/price free" | med‑high (free users) | med | **low** to try, higher to pay | **best fit for beta** |
| **Partner / broker‑supported** | high (trusted intro) | med (partner‑dependent) | med (B2B2C) | may need multi‑party terms | low‑med | low | low (warm) | good Stage 2–3 |
| **Hybrid** (freemium + sub + partner) | high | med‑high | **higher** | most complex | med‑high | med | mixed | later, once validated |

**Read:** start **freemium → Pro** (lowest friction to *try*, honest free value, tests WTP), with **per‑report**
as a parallel probe for occasional buyers. Layer **partner/broker** distribution in Stage 2–3. Avoid the full
**hybrid** until the core is validated (complexity + support + licensing cost).

## B. Assumptions (EDITABLE — Low / Base / High; all hypotheses to validate in the beta)
| Variable | Low | Base | High | Notes |
|---|---|---|---|---|
| Monthly Pro price (A$) | 9 | **19** | 39 | positions below RE Investar ($99.90+/mo) & data subs (~$180+/mo) |
| Per‑report price (A$) | 5 | 15 | 29 | secondary probe |
| Free→paid conversion | 3% | **8%** | 15% | invite cohort likely > public freemium (2–10%) |
| Monthly retention | 85% | **92%** | 96% | churn = 1 − retention (15% / **8%** / 4%) |
| CAC (A$) | 0 | **15** | 50 | Low = founder network/referral; High = early paid |
| Referral rate (new invites per active/period) | 0.1 | 0.3 | 0.6 | drives organic growth |
| Analyses per active user / month | 2 | 5 | 12 | usage → infra + value |
| Infra cost / active user / month (A$) | 0.50 | **1.50** | 4.00 | hosting + DB at scale |
| Support cost / active user / month (A$) | 1.00 | **4.00** | 10.00 | founder‑led early, decreasing with docs/automation |
| **Provider/data licensing cost** | **[UNKNOWN]** | **[UNKNOWN]** | **[UNKNOWN]** | **explicit variable** — unpublished (see `../provider_research.md`); **$0 only while manual‑entry beta runs (no licensed feed)**; becomes a real per‑user or fixed monthly cost once a feed is signed. **Do not treat as zero at scale.** |

## C. Formulas (so the sheet is reproducible)
```
paid_users            = total_users × free→paid_conversion        (freemium)  |  = total_users (pure sub)
MRR                   = paid_users × monthly_price
variable_cost/user    = infra_cost + support_cost + provider_cost_per_user      (provider = 0 while manual‑entry)
gross_margin/user     = monthly_price − variable_cost/user
gross_margin %        = gross_margin/user ÷ monthly_price
avg_lifetime (months) = 1 ÷ monthly_churn
LTV                   = monthly_price × gross_margin% × avg_lifetime
LTV:CAC               = LTV ÷ CAC
CAC payback (months)  = CAC ÷ (monthly_price × gross_margin%)
monthly_contribution  = paid_users × gross_margin/user − fixed_costs
```

## D. Scenario outputs — Base assumptions (price $19, conv 8%, churn 8%, infra $1.50, support $4.00, provider $0 manual‑entry)
gross_margin/user = 19 − (1.50 + 4.00 + 0) = **$13.50** → margin **71%**; avg lifetime = 1/0.08 = **12.5 mo**;
LTV = 19 × 0.71 × 12.5 ≈ **$169**; at CAC $15 → **LTV:CAC ≈ 11×**, payback ≈ **1.1 mo**. *(Illustrative — validate.)*

| Total users | Paid (8%) | MRR (A$) | Annualised (A$) | Monthly contribution* (A$) |
|---|---|---|---|---|
| 25 | 2 | ~38 | ~456 | ~27 |
| 100 | 8 | ~152 | ~1,824 | ~108 |
| 300 | 24 | ~456 | ~5,472 | ~324 |
| 1,000 | 80 | ~1,520 | ~18,240 | ~1,080 |
*contribution = paid × $13.50, before founder time + any fixed tooling. **Provider licensing cost at 300–1,000
users is the dominant unknown** — model it explicitly before committing to a feed.*

**Sensitivity — if a licensed feed adds `[PROVIDER_COST]` per user/month:** gross_margin/user = 13.50 − provider_cost.
At provider_cost = $5 → margin drops to $8.50 (45%); at $10 → $3.50 (18%). **A feed can halve or erase margin** —
so either (a) keep listing/agent/price free+attributed and price Pro high enough to absorb it, or (b) stay
manual‑entry until unit economics justify a feed. This is the single most important cost gate.

## E. Sensitivity drivers (rank order)
1. **Free→paid conversion** and **price** (multiply directly into MRR).
2. **Retention** (churn) — sets lifetime and therefore LTV.
3. **Provider/data licensing cost** — the biggest downside risk at scale (unknown).
4. **Support cost/user** — must fall as the cohort grows (docs, self‑serve, `support_playbook`).
5. **CAC** — kept ~0 in Stage 1 via founder network; watch as paid acquisition starts.

## F. Recommended FIRST pricing test (proposal, not final)
Run **freemium with a Pro tier at a hypothesised A$19/month** (unlimited Deal Briefs + saved buy box + compare),
free tier = a limited number of briefs/month. **In parallel**, verbally test **$9 / $19 / $29** and a **per‑report
$15** option in the day‑30 survey + interviews (Van Westendorp‑lite; see `../../../launch/v8_founding_beta/pricing_research_plan.md`).
- **Decision rule:** if ≥40% WTP at ≥$19 with acceptable conversion → validate $19 sub. If price sensitivity is
  high but usage is occasional → test per‑report. **Do not announce a final price during the beta.**

## G. Guardrails
Provider/data cost stays an explicit variable (never $0 at scale). Prices are hypotheses. No licensed‑live‑data
claim. Legal entity/ABN/contact remain placeholders. Nothing here is financial advice.
