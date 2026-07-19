#!/usr/bin/env node
/**
 * ASGS backbone loader — PLACEHOLDER (Sprint 2, not yet implemented).
 *
 * Intended behaviour when implemented:
 *   Inputs:  reviewed manifest (warehouse/reports/asgs_source_manifest.json) and
 *            raw ASGS files previously downloaded to warehouse/data/asgs/<edition>/
 *            (gitignored); database connection from environment variables.
 *   Outputs: staging.asgs_area / staging.asgs_allocation, then upserts into
 *            core.dim_geography (with MultiPolygon EPSG:4326 geometry),
 *            core.bridge_geography_relationship (containment hierarchy only) and
 *            core.bridge_geography_correspondence (weighted cross-structure links).
 *            Run + gate results recorded in meta.load_run / meta.data_quality_result.
 *
 * Validation gates (block promotion to core on failure):
 *   - duplicate geography codes = 0 per (type, boundary_version)
 *   - invalid geometries = 0, or quarantined and counted — never silently fixed
 *   - missing SAL/POA/SA2 vs ABS counts = 0 unless documented in coverage_result
 *   - correspondence weights sum to 1.0 (±0.001) per source area per target type
 *   - missing data stays NULL — no zero-filling
 *
 * Deliberately does NOT (now): connect to any database, read secrets, download
 * anything, or modify any state. Targets a local/branch database first when
 * implemented; the linked Supabase project is never touched without approval.
 *
 * Plan: warehouse/docs/SPRINT_2_ASGS_GEOGRAPHY_BACKBONE.md
 */

console.log("load_asgs_backbone: placeholder — Sprint 2 not yet implemented.");
console.log("");
console.log("TODO (Sprint 2):");
console.log("  1. Verify migrations 003 + 004 are applied to the TARGET (local/branch) database");
console.log("  2. Load raw files from warehouse/data/asgs/ into staging (ST_Transform -> EPSG:4326)");
console.log("  3. Upsert core.dim_geography for all 9 levels (parents only within SA1->...->STATE)");
console.log("  4. Build bridge_geography_relationship (containment) and");
console.log("     bridge_geography_correspondence (SA1/SA2 -> SAL/POA/LGA with weights)");
console.log("  5. Enforce validation gates; record results in meta tables");
console.log("");
console.log("Exiting safely — no database was contacted, nothing was changed.");
process.exit(0);
