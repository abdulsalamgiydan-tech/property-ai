# Shared provenance/lineage shape

Every adapter's branch load writes through the same `meta.*` tables
established in Sprint 1 (`003_warehouse_foundation.sql`):

- `meta.source` — one row per publisher/authority (e.g. `nsw_vg_sales`, `vic_vg_sales`)
- `meta.dataset` — one row per distinct product within a source
- `meta.load_run` — one row per extract/load execution
- `meta.source_file` — one row per physical file ingested, with a SHA-256 hash

Every fact/mart row carries `source_id`, `dataset_id`, `load_run_id`, and
`source_file_id` (or an equivalent `source_summary` jsonb for marts) tracing
back to this lineage. No adapter invents its own parallel lineage shape.
