# Geography scripts

Scripts for building the ABS ASGS geography backbone (Sprint 2). Plan:
`warehouse/docs/SPRINT_2_ASGS_GEOGRAPHY_BACKBONE.md`.

| Script | Status | Purpose |
|---|---|---|
| `discover_asgs_sources.mjs` | placeholder | Enumerate official ABS ASGS boundary + correspondence downloads into a manifest (`warehouse/reports/asgs_source_manifest.json`) |
| `load_asgs_backbone.mjs` | placeholder | Load staged ASGS files into `core.dim_geography` and the two bridge tables, enforcing the Sprint 2 validation gates |

Ground rules for implementing these:

- Official ABS sources only (CC BY 4.0); no scraping of protected/commercial sites.
- Raw downloads go to `warehouse/data/` (gitignored) — never into git.
- Database connections come from environment variables; no secrets in code and no
  values printed.
- Loads target a local/branch database first; nothing touches the linked Supabase
  project without explicit approval.
- Missing data stays NULL — no zero-filling, no silent geometry fixes (quarantine
  instead).
