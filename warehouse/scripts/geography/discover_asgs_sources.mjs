#!/usr/bin/env node
/**
 * ASGS source discovery — PLACEHOLDER (Sprint 2, not yet implemented).
 *
 * Intended behaviour when implemented:
 *   Inputs:  ABS ASGS Edition 3 "Data downloads" pages (official ABS site only).
 *   Outputs: warehouse/reports/asgs_source_manifest.json — one entry per artefact
 *            with { dataset_id, geography_type, url, format, reference_period,
 *            licence, approx_size } for review BEFORE anything is downloaded.
 *
 * Deliberately does NOT (now or when implemented):
 *   - download boundary files into the repo (they are hundreds of MB; downloads
 *     go to gitignored warehouse/data/ only after the manifest is reviewed)
 *   - connect to Supabase or any database
 *   - require secrets or read .env values
 *   - touch any non-ABS / commercial site
 *
 * Plan: warehouse/docs/SPRINT_2_ASGS_GEOGRAPHY_BACKBONE.md
 */

console.log("discover_asgs_sources: placeholder — Sprint 2 not yet implemented.");
console.log("");
console.log("TODO (Sprint 2):");
console.log("  1. Enumerate ABS ASGS Ed.3 boundary downloads (SA1-SA4, GCCSA, STATE, SAL, POA, LGA)");
console.log("  2. Enumerate SA1-based allocation/correspondence files (SA1->SAL, SA1->POA, SA1->LGA)");
console.log("  3. Write manifest to warehouse/reports/asgs_source_manifest.json for review");
console.log("  4. No files are downloaded by this script.");
console.log("");
console.log("Exiting safely — nothing was fetched, written or changed.");
process.exit(0);
