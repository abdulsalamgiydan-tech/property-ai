# Propellect — next three sprints

Each sprint is issue-ready. SA-only until per-state gates pass; no Australia-wide claim. Evidence-first; AI narrates, never generates figures/sources.

---
## Sprint A — V6D: SA Beta Production launch
**Customer outcome:** SA customers can, on `app.propellect.com.au`, get a ranked, evidence-backed shortlist and save/compare it across sessions.
**Exact scope:** apply 059→060→061 to Production; enable the flag on Project B; merge PR #36; deploy; live signed-in UAT; 24h monitoring. No new features.
**Work packages:** (A1) Production DB gate (apply + verify objects/grants/RLS/policies/constraints/RPC/advisors independently of ledger). (A2) Set `WAREHOUSE_PREVIEW_ENABLED=true` in Project B Production before the build. (A3) Merge PR #36 + Project B Production deployment from the merge commit. (A4) Cache-bypassed live signed-in UAT (the V6C.1 browser E2E, now closable with a real login). (A5) Monitoring + warm-rollback readiness.
**Acceptance:** core 768; ranked/set-aside 71/91; checksum `f1cbf0ee…`; Grange/Belair unchanged; least-privilege RPC + hardened user tables verified; `app.propellect.com.au` serves the merge commit; full live signed-in journey passes; no synthetic/national wording.
**Dependencies:** explicit Production authorisation; Project B Vercel access; validation email limit reset (for the login).
**Data/security:** additive migrations only; anon/PUBLIC no user-table access; same-user FK; no service-role in browser; Production data untouched.
**Metrics:** deploy health, auth success, API error rate, persistence correctness.
**Entry gate:** V6C.1 evidence + green gates + authorisation. **Exit gate:** live UAT pass + 24h clean.
**Deliberately waits:** any new feature, NSW/VIC, property-level.

---
## Sprint B — V6E: Beta operations, instrumentation, E2E smoke
**Customer outcome:** a measurably reliable Beta; we see where users drop and prove the signed-in journey stays healthy.
**Exact scope:** funnel + activation instrumentation; in-product feedback; a **CI signed-in E2E smoke test** (closes the V6C.1 bounded gap durably); rollback-threshold alerting.
**Work packages:** (B1) privacy-safe event stream (start→results→drawer→save→shortlist→return; no PII). (B2) activation/retention dashboards (D1/D7, save-rate). (B3) Playwright signed-in E2E against a Preview with a test-mailbox login, wired into CI as non-blocking→blocking. (B4) feedback capture. (B5) alerting on rollback thresholds.
**Acceptance:** funnel visible end-to-end; E2E smoke passes in CI on a Preview; feedback reaching the team; alerts fire on synthetic breaches.
**Dependencies:** V6D live; a validation/preview test mailbox or raised email limit / custom SMTP.
**Data/security:** analytics carry no PII/secrets; test accounts are disposable and cleaned up.
**Metrics:** activation rate, D1/D7 retention, funnel conversion, E2E pass rate.
**Entry gate:** V6D exit. **Exit gate:** instrumentation trusted + E2E green in CI.
**Deliberately waits:** premium paywall, new states, watchlist alerts (design only).

---
## Sprint C — V7 slice: watchlist + change-alerts on shortlisted suburbs
**Customer outcome:** users get notified when the evidence behind a shortlisted SA suburb changes (e.g., growth/yield moves), with a plain-English, sourced explanation.
**Exact scope:** subscribe shortlisted suburbs to change events (reuse the existing watchlist_change_events pattern); a deterministic "what changed + source/period" explainer; in-app notifications. SA official metrics only.
**Work packages:** (C1) additive migration for shortlist→change-event linking (RLS-scoped, same-user; drafted for separate approval, not applied here). (C2) change detector over refreshed official metrics (no synthetic values; missing/stale reduces confidence, never fabricates). (C3) explainer strings from engine deltas + provenance. (C4) notifications UI + preferences. (C5) tests: determinism, provenance mapping, RLS, no cross-user leakage.
**Acceptance:** a real SA metric change produces exactly one sourced alert to the owning user only; no alert on missing/stale (confidence-only); cross-user isolation holds; every alert figure maps to provenance.
**Dependencies:** V6E instrumentation; official-refresh cadence; migration approval.
**Data/security:** RLS same-user; no PII in alerts; licence/attribution preserved; internal schemas stay revoked.
**Metrics:** alert open-rate, return-visit lift, watchlist retention.
**Entry gate:** V6E exit. **Exit gate:** alert correctness + isolation proven; retention lift measured.
**Deliberately waits:** property-level packs (V9), Copilot auto-actions (V10), national expansion (behind V8 gates).
