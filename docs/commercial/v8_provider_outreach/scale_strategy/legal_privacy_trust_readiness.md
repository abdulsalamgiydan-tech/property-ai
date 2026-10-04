# V8 — Legal, privacy & trust readiness checklist

> **This is a preparation checklist for qualified legal/privacy review — it is NOT legal advice and NOT a set of
> conclusions.** It flags areas to confirm with a professional before any **public commercial** launch. Where
> applicability is uncertain, it says so rather than overstating a requirement. Australian English. Research date
> 2026‑08‑16.

## How to read this
Each row = an **area to review**, why it may matter for Propellect, and the **authority** to check with a lawyer.
"May apply" ≠ "does apply". A qualified adviser must determine applicability to your entity and product.

## Areas to review (with a qualified adviser)
| Area | Why it may matter for Propellect | Authority / source (for the adviser) | Status |
|---|---|---|---|
| **Privacy & personal information** | We store users' buy box + entered deals; possibly personal info | OAIC — Privacy Act 1988 / Australian Privacy Principles (oaic.gov.au) | review — confirm if/which APPs apply to the entity |
| **Privacy policy & collection notice** | Standard for a product that collects data | OAIC guidance (oaic.gov.au) | prepare a policy for legal review |
| **Consent & data retention** | Beta consent captured in screening form; deletion offered | OAIC (oaic.gov.au) | confirm consent wording + retention/deletion process |
| **Marketing consent (email/DM)** | Invites + updates to individuals | ACMA — Spam Act 2003 (acma.gov.au); consent + unsubscribe | confirm opt‑in + unsubscribe compliance |
| **User‑entered third‑party info** | Users type facts from listings; source URL reference‑only | product policy + adviser | confirm T&Cs make the user responsible for entered data; **no scraping** documented |
| **Product/marketing claims** | "Evidence‑backed", metrics, comparisons must be accurate/not misleading | ACCC — Australian Consumer Law (accc.gov.au) | review landing/marketing copy for misleading‑claim risk |
| **Financial‑services boundary** | We must **not** give financial product advice or imply valuations | ASIC (asic.gov.au); Moneysmart — note: **direct residential property is generally not a "financial product"** under the Corporations Act, but *claims/wording* can still create risk | **review** — confirm our not‑advice/not‑valuation framing is sufficient; do **not** assume an AFSL is required or that it isn't |
| **Disclaimers placement** | Not‑a‑valuation / not‑advice near every output | adviser + `../../../launch/v8_founding_beta/trust_safety_disclosures.md` | confirm wording + placement |
| **Terms of use** | Needed before paid launch | adviser | draft for review |
| **Complaints handling** | Basic process for a paid product | adviser | define a simple process |
| **Provider licensing & attribution** | Any future licensed feed adds display/attribution/retention obligations | provider contracts (see `provider_negotiation_strategy.md`) | not applicable during manual‑entry beta; review before any feed |
| **Data security** | Protecting user data | OAIC + security best practice | confirm least‑privilege, isolation, no client secrets (Codex‑owned technical) |

## Sequencing (recommendation)
- **Founding beta (manual‑entry, free, invite‑only):** lower‑risk; ensure **not‑advice/not‑valuation disclaimers**,
  a **privacy/collection notice + consent + deletion**, honest claims, and Spam‑Act‑compliant invites are in place.
- **Before charging / public launch:** commission a qualified **legal + privacy review** covering the "prepare"
  items above (privacy policy, terms, financial‑services framing, consumer‑law claims, complaints).

## Explicit limits of this document
- Not legal advice; not a determination that any law does or does not apply.
- Does **not** overstate requirements — several rows are "confirm applicability", not "you must".
- The financial‑services line is a known sensitivity: keep the product framed as **illustrative decision‑support,
  not a valuation or financial product advice**, and have that framing reviewed.

## Sources (for the reviewing professional; reviewed 2026‑08‑16)
OAIC (privacy): https://www.oaic.gov.au/ · ACMA (spam/marketing): https://www.acma.gov.au/ ·
ACCC (consumer law/claims): https://www.accc.gov.au/ · ASIC (financial services): https://asic.gov.au/ ·
Moneysmart (consumer guidance): https://moneysmart.gov.au/. *(URLs provided as pointers for the adviser; specific
applicability must be professionally assessed.)*
