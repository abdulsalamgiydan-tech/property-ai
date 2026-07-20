# Shared sample-size confidence thresholds

The one true set of thresholds every jurisdiction adapter must use — never
redefined per state. Established in Sprint 5 (NSW sales), reused unchanged
through every subsequent sprint.

| label | sample size |
|---|---|
| `high` | ≥ 30 |
| `medium` | ≥ 10 |
| `low` | ≥ 5 |
| `insufficient` | < 5 |

Every row is published regardless of confidence — `insufficient` cells are
never suppressed, just labelled. Consumers must check the label before
treating a median/count as reliable.
