# Storage scripts

Local-first national data lake catalogue and hygiene checks (Sprint 11,
Workstream 7). Read-only, no Supabase connection, never delete anything
automatically.

| Script | Status | Purpose |
|---|---|---|
| `audit_local_storage.mjs` | done | Inventories `warehouse/data/{raw,processed,local}` — per-dataset size/file-count, `.gitignore` coverage check, git-tracked-file check. Writes `local_storage_audit.{json,md}`. |
| `plan_local_cleanup.mjs` | done | Reads the audit and proposes which `processed/` datasets are safe to delete (their `raw/` source still exists on disk, so they're re-derivable). Writes the exact `rm -rf` commands to `local_cleanup_plan.{json,md}` — never runs them. |
| `verify_gitignored_data.mjs` | done | Complements `check_warehouse_files.mjs`'s fixed-extension scan with a STAGED-files check (catches a raw file about to be committed, before it lands) and a dynamic on-disk extension inventory. Exits non-zero on failure — safe to wire into a pre-commit hook or CI step. |

Ground rules (same as other warehouse scripts):

- Everything under `warehouse/data/` is gitignored via a single blanket
  rule (`.gitignore`) — verified live by these scripts, not assumed.
- Deletion is always a human decision. `plan_local_cleanup.mjs` proposes,
  it never executes — consistent with this project's rule that
  hard-to-reverse operations are never auto-run.
- `warehouse/data/processed/` is disposable extraction scratch space once
  its data has been consumed into a `warehouse/data/local/*.duckdb` /
  `*.parquet` build — the raw `.zip`/`.xlsx` sources in `warehouse/data/raw/`
  remain the actual source of truth and are never deleted by this workstream.
