# Feedback taxonomy — founding beta

> A shared tagging scheme so every survey answer, interview note and support ticket rolls up consistently.
> Product/analytics level only — no implementation detail. Australian English.

## Primary categories (tag every item with one)
| Tag | Meaning | Example |
|---|---|---|
| `activation-friction` | Blocked or slowed getting to a first Deal Brief | "couldn't find where to set my buy box" |
| `data-entry` | Manual‑entry effort / clarity | "too many fields", "didn't know land size" |
| `output-clarity` | Understanding the Deal Brief + labels | "unclear what 'estimate' meant" |
| `trust` | Believing the numbers / sources | "didn't trust the cash‑flow estimate" |
| `coverage` | Thin/missing official evidence for a suburb | "no data for my area" |
| `accuracy` | A result looked wrong | "score seems too high for that price" |
| `feature-gap` | Missing capability | "want to compare more than 3", "want alerts" |
| `value` | Perceived usefulness / would‑pay | "this saved me an hour", "not worth paying yet" |
| `bug` | Something broke | "page errored on save" |
| `praise` | What delighted | "the 'why it may not fit' section is great" |

## Secondary attributes
- **Severity:** `p0` blocks activation · `p1` core flow broken · `p2` friction/clarity · `p3` nice‑to‑have.
- **Sentiment:** positive / neutral / negative.
- **Journey stage:** buy‑box · enter‑deal · read‑brief · save/pass · compare · return‑visit.
- **Source:** day‑7 · day‑30 · interview · support · unsolicited.

## How it rolls up
- Weekly: count by category × severity → the friction board (drives the Friday fix).
- End‑of‑beta: top themes by frequency + severity feed the **go/no‑go memo** and the roadmap.
- `value` + WTP signals cross‑reference `pricing_research_plan.md`.

## Rules
- One primary tag per item (add a note if multi‑theme). Keep verbatim quotes.
- Never discard "not useful"/"wrong" feedback — tag it `accuracy`/`value` and investigate.
- Don't tag a labelling limitation (honest "missing" evidence) as a `bug`; it's `coverage`.
