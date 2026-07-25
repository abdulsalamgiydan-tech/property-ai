# Shared blocking validation gate categories

Every adapter's local validator (`validate_*.mjs`) and every branch loader's
post-load transaction gate must check these categories, in addition to any
jurisdiction-specific checks:

1. Duplicate natural/transaction keys = 0
2. Negative prices/rents/counts = 0
3. NULL geography on a publishable row = 0 (excluding expected special/quarantine codes)
4. Duplicate summary/mart grain = 0
5. Orphan geography IDs (no matching `core.dim_geography` row) = 0
6. Every published price/rent/yield row carries a confidence label
7. Missing values stay NULL — never zero-filled or estimated
8. Raw/local data files are gitignored and not staged in git

Failing any of these inside a branch-load transaction triggers an automatic
rollback — no partial/inconsistent commit is ever allowed to land.
