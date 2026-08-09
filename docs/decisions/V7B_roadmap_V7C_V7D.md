# V7B → V7C / V7D — issue-ready roadmap

Framing (unchanged): evidence-first, SA-only until per-state gates pass, AI narrates deterministic
engine output and never fabricates. Each item below is issue-ready. Nothing here authorises a
Production change, a migration apply, a flag flip, or a merge/deploy.

## Immediate follow-ups from V7B (to close the alpha)
1. **Provider approval loop** — send the three prepared enquiries (Domain / PropTrack / Cotality),
   capture written answers to the five open questions in `V7B_listing_provider_decision.md`
   (subscription gating, derived-score rights, retention, enrichment display, SA→national cost).
   **Exit:** a signed Product Schedule with the Deal Hunter use case explicitly approved.
2. **Preview browser evidence** — run the desktop + mobile Deal Hunter journey on a Preview deploy with a
   test-mailbox login and capture screenshots (the local Windows env can't drive a browser). Wire a
   Playwright signed-in smoke test into CI (extends the V6E E2E plan).

## V7C — Live SA ingestion behind the primary provider (gated on approval)
- **C1.** Implement the live **Domain adapter** HTTP path (OAuth token, listings search, mandatory
  view/image/enquiry event reporting per clause 17.1) behind server-only credentials. Draft **migration 064**
  for canonical listing persistence (internal schema + least-privilege consumer RPC, like 056/059) — draft +
  disposable-local tests only.
- **C2.** Geography resolution: map provider addresses → canonical SAL `geographyId` (warehouse bridge) so
  listings join suburb evidence reliably.
- **C3.** Retention/attribution enforcement in production: "Powered by Domain" + link-back + no-index +
  cache TTL + `purgeExpired`/`purgeProvider` scheduled jobs; prove a **small current SA sample** without
  persisting/displaying beyond the licence.
- **C4.** Persisted per-user **listing events** via a SECURITY DEFINER detector (the 062 pattern) once
  listings live in the DB — replacing the alpha's on-the-fly events. Draft migration, separate approval.
- **Exit:** a small real SA sample proven end-to-end (listing → deal brief) under the signed licence.

## V7D — Enrichment + premium + resilience
- **D1.** **Enrichment lane**: wire a licensed AVM/rental estimate (PropTrack or Cotality) as a
  `redistribution_ok=false` confidence input (registry-driven; never displayed) — raises `confidence`
  and downside resilience without showing licensed figures.
- **D2.** **Premium experiment**: gate the derived Deal Brief / unlimited pipeline behind a subscription
  (only if the provider confirms in writing that our derived analysis may be paywalled while listing
  display + agent contact + price estimates stay free/attributed). Measure paywall view → trial → paid.
- **D3.** **Notification delivery**: turn listing events into a digest (in-app + opt-in email), reusing the
  V7A notification-prefs model; per-user cron detection.
- **D4.** **Sensitivity in the brief**: rate/deposit/holding sliders re-running the tested engine live in the
  Deal Brief (reuse `propertyAnalysisSensitivity`).
- **D5.** **Feedback → proposals v2**: broaden `proposePreferenceAdjustments` (location, land, beds) with
  confidence and one-click "apply to profile" (still explicit, still transparent — no silent re-ranking).

## Deliberately deferred (unchanged gates)
- **National expansion** — only when a state's price+rent+yield+volume+growth are present, fresh,
  redistribution-cleared and cost-justified (the V8 gates). No nationwide claim until every offered state passes.
- **Property-level due-diligence packs** (V9) and the approval-controlled **Investment Copilot** (V10).
- Any generative "AI advisor" that emits prices/recommendations — breaks the never-fabricate rule.
