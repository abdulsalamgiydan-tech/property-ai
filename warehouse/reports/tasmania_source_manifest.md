# Tasmania Source Manifest (Sprint 11, Workstream 2, rent re-verified in Workstream 6)

Generated: 2026-07-21. Rent status updated 2026-07-22.

| | Sales | Rent |
|---|---|---|
| Publisher | Office of the Valuer-General | CBOS / DOJ Tasmania (both identified, both inaccessible) |
| Status | **paid_or_restricted** | **blocked_access** |
| Verification | Search-only, not live-downloaded | **Live-verified (Workstream 6)** |

The Valuer-General's "Property Sales Report" via LIST appears fee-based
(Service Tasmania states fees may be payable); the example PDF was not
downloaded this pass, still search-only.

Rent was upgraded from "search-only" to a definitive live-verified
finding in Workstream 6: both identified official candidates —
**CBOS Rental Bond Statistics** and **DOJ Rental Bonds Output Data** —
return HTTP 403 with a Cloudflare "Enable JavaScript and cookies to
continue" challenge page. This project's guardrails forbid bypassing
Cloudflare/anti-bot protection, so neither is buildable even though the
underlying data is genuinely free and official. A third-party mirror
(Tenants' Union of Tasmania) republishes similar figures but is an
advocacy organisation, not an official source, so it doesn't qualify
either. **TAS rent coverage is finalised as blocked_access — no adapter
will be built.**
