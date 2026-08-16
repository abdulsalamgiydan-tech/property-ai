# V8 — Abdul's decision sheet (the six inputs needed BEFORE provider outreach)

These are the only material facts that block sending the provider enquiries. **I have not chosen any of these
for you** — each has a *proposed working default* (a recommendation, **not** an established fact) plus a fill‑in
field. Nothing here is legal or financial advice; verify entity/ABN/contract matters with a qualified adviser.

Australian English. These map 1:1 to the `[PLACEHOLDERS]` in the enquiry drafts and one‑pager.

> **Consolidated recommendations** for these six (with evidence + the modelled volume/pricing) live in
> `scale_strategy/abdul_decision_recommendations.md`; the unit‑economics behind them are in
> `scale_strategy/business_model_and_unit_economics.md`. This sheet and that file are kept consistent — the modelled
> defaults below (pilot size, volume, commercial model) mirror it; legal entity/ABN/contact stay **placeholders**.

---

### 1. Legal entity → `[LEGAL_ENTITY]`
- **Why needed:** every provider licences to a legal entity; the enquiry and any Product Schedule name it.
- **Proposed default (proposal, not fact):** the registered company you trade Propellect under (e.g. a Pty Ltd).
  If you're currently a sole trader, that's fine to state — but confirm the exact registered name.
- **Your answer:** `__________________________`

### 2. ABN → `[ABN]`
- **Why needed:** Cotality (and likely others) ABN‑gate access; it also establishes you're a genuine business.
- **Proposed default:** the 11‑digit ABN of the entity in #1.
- **Your answer:** `__________________________`

### 3. Contact name & details → `[CONTACT_NAME]`, `[CONTACT_EMAIL]`
- **Why needed:** providers reply to a named person; used in the signature + account setup.
- **Proposed default:** you, with a business email on your domain (more credible than a personal address).
- **Your answer:** name `______________`  email `______________`  phone (optional) `______________`

### 4. SA pilot size → `[PILOT_USER_COUNT]`
- **Why needed:** sizes the request and shows the pilot is small/contained; affects min‑tier discussions.
- **Proposed default:** **up to 25** invited SA investors (matches the founding‑beta plan).
- **Your answer:** `__________` invited users

### 5. Expected licensed-read volume → `[ESTIMATED_MONTHLY_LISTING_VOLUME]`
- **Why needed:** providers price by volume/tier; you want the smallest tier that fits — but the number must be
  **licensed provider reads**, not analyses or API calls (those are different things; see the corrected model).
- **Important:** the **manual-entry beta consumes ZERO licensed reads** (no live feed). This figure is a
  **forward-sizing hypothesis for *if* a feed is signed**, not beta consumption.
- **Proposed default (hypothesis — validate):** modelled from `active users × completed analyses × provider reads
  per analysis` — post-feed **~150 (Low) · ~750 (Base) · ~3,700 (High) licensed reads/month** for ≤25 users. To
  avoid under-provisioning, **ask a provider for a tier covering ~4,000–5,000 reads/month with headroom**, stating
  the beta itself is zero. Full decomposition (analyses started/completed, unique properties, API calls) lives in
  `../../launch/v8_founding_beta/recruitment_pipeline/usage_volume_model.md`; mirrors `scale_strategy/abdul_decision_recommendations.md`.
- **Your answer:** `__________` licensed reads/month (post-feed sizing) · `__________` (12‑month)

### 6. Preferred commercial model → `[PROPOSED_COMMERCIAL_MODEL]`
- **Why needed:** frames the "what we'd charge for" conversation and the free‑vs‑paid boundary.
- **Proposed default (proposal):** consumer **subscription** for Propellect's *derived* analysis, with the
  provider's listing display/agent/price kept **free + attributed**; open to a per‑report option. (Pricing itself
  is a hypothesis to validate in the beta — see `../../launch/v8_founding_beta/pricing_research_plan.md`.)
- **Your answer:** `__________________________`

---

## Also confirm (not a `[PLACEHOLDER]`, but blocks outreach)
- **Which providers to contact and in what order** — proposed: Domain first (fastest to a compliant pilot),
  PropTrack in parallel (fallback + enrichment), Cotality only for score‑only enrichment. Confirm/adjust.
- **Approval to send** each finalised draft (they remain **unsent** until you say so).

Once #1–#6 are filled and you approve, the drafts in this folder can be finalised and sent.
