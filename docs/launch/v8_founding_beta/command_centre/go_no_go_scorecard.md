# V8 — Go / No‑Go scorecard (pre‑launch gate)

Australian English. Complete before inviting participants. Score each dimension **Ready / Partial / Not ready**.
Technical items are **Codex‑owned** (confirm status; this workstream does not perform them).

## Dimensions
| # | Dimension | What "Ready" looks like | Owner | Status |
|---|---|---|---|---|
| 1 | **Technical readiness** | V8 Preview live, invite‑only gating on, desktop+mobile UAT passed, isolation proven | Codex | ☐ |
| 2 | **Product usefulness** | Buy box → Deal Brief works; confirm‑before‑incomplete behaves; labels visible | Codex + Abdul | ☐ |
| 3 | **Participant readiness** | ≥30 SA prospects shortlisted; screening + invites ready; ~25 can be activated | Abdul | ☐ |
| 4 | **Trust & safety** | Not‑valuation/not‑advice disclaimers placed; labelling clear; no licensed‑data claim; privacy/consent + deletion in place | Abdul (+ legal review) | ☐ |
| 5 | **Provider/data status** | Beta runs **manual‑entry** with no provider dependency; no false licensed‑data claim anywhere | Abdul | ☐ |
| 6 | **Support readiness** | `support_playbook` briefed; 1‑business‑day response capacity; canned answers ready | Abdul | ☐ |
| 7 | **Measurement readiness** | KPI dashboard set up; surveys scheduled; pipeline template ready; definitions agreed | Abdul | ☐ |

## Thresholds
- **GO** — invite all: **all 7 Ready**, with **#1, #2, #4 mandatory Ready**.
- **CONDITIONAL GO** — invite a **small first wave (~5–8)**: #1, #2, #4 Ready; up to **two** of #3/#5/#6/#7 Partial
  with a dated fix plan.
- **NO‑GO** — do not invite: **any** of #1 (technical), #2 (usefulness) or #4 (trust/safety) is **Not ready**; or
  ≥3 dimensions Partial/Not ready.

## Rule
Never launch with **#4 Trust & safety** below Ready — an early trust failure (a user treating output as a
valuation/advice, or a data/privacy gap) is the most damaging outcome. When in doubt, **CONDITIONAL GO** a tiny
wave and learn before the full 25.

## Sign‑off
- Technical GO/NO‑GO (Codex): ______  date: ______
- Business approval (Abdul): ______  date: ______
- Decision: ☐ GO ☐ CONDITIONAL GO (wave size ___) ☐ NO‑GO — reason: __________
