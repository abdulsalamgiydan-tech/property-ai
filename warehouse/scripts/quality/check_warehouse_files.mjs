#!/usr/bin/env node
/**
 * Warehouse skeleton validation (Sprint 1 + 1.5).
 * Verifies required folders, metadata/config files, migrations 003/004
 * (non-destructive, PostGIS wired up), metadata content, and plan docs.
 * Exits non-zero on failure.
 *
 * Run: npm run warehouse:check
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const requiredFolders = [
  "warehouse/config",
  "warehouse/metadata",
  "warehouse/scripts/extract",
  "warehouse/scripts/transform",
  "warehouse/scripts/load",
  "warehouse/scripts/quality",
  "warehouse/scripts/geography",
  "warehouse/reports",
  "warehouse/docs",
];

const requiredFiles = [
  "warehouse/metadata/source_register.csv",
  "warehouse/metadata/metric_dictionary.csv",
  "warehouse/metadata/geography_dictionary.csv",
  "warehouse/config/sources.yml",
  "warehouse/config/geography.yml",
  "warehouse/config/quality_rules.yml",
  "warehouse/docs/WAREHOUSE_PLAN.md",
  "supabase/migrations/003_warehouse_foundation.sql",
  "supabase/migrations/004_postgis_geography.sql",
  "supabase/migrations/005_asgs_staging.sql",
  "warehouse/reports/asgs_source_manifest.json",
  "warehouse/reports/asgs_source_manifest.md",
];

const expectedRegisterHeaders = [
  "source_id",
  "source_name",
  "publisher",
  "source_category",
  "official_or_independent",
  "source_url",
  "licence",
  "access_method",
  "update_frequency",
  "implementation_status",
  "known_limitations",
];

let failures = 0;

function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("Warehouse skeleton check\n");

console.log("Folders:");
for (const folder of requiredFolders) {
  const full = path.join(repoRoot, folder);
  check(folder, fs.existsSync(full) && fs.statSync(full).isDirectory());
}

console.log("\nFiles:");
for (const file of requiredFiles) {
  const full = path.join(repoRoot, file);
  check(file, fs.existsSync(full) && fs.statSync(full).isFile());
}

console.log("\nsource_register.csv headers:");
const registerPath = path.join(repoRoot, "warehouse/metadata/source_register.csv");
if (fs.existsSync(registerPath)) {
  const firstLine = fs.readFileSync(registerPath, "utf8").split(/\r?\n/, 1)[0];
  const headers = firstLine.split(",").map((h) => h.trim());
  const missing = expectedRegisterHeaders.filter((h) => !headers.includes(h));
  check(
    "expected header columns present",
    missing.length === 0,
    missing.length ? `missing: ${missing.join(", ")}` : undefined
  );
} else {
  check("source_register.csv readable", false, "file not found");
}

function readSqlLower(relPath) {
  const full = path.join(repoRoot, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8").toLowerCase();
}

console.log("\nMigration 003 sanity:");
const sql003 = readSqlLower("supabase/migrations/003_warehouse_foundation.sql");
if (sql003 !== null) {
  for (const schema of ["meta", "raw", "staging", "core", "mart", "audit"]) {
    check(
      `creates schema ${schema}`,
      sql003.includes(`create schema if not exists ${schema}`)
    );
  }
  check("no destructive DROP TABLE", !sql003.includes("drop table"));
  check("no destructive DROP SCHEMA", !sql003.includes("drop schema"));
} else {
  check("migration 003 readable", false, "file not found");
}

console.log("\nMigration 004 sanity:");
const sql004 = readSqlLower("supabase/migrations/004_postgis_geography.sql");
if (sql004 !== null) {
  check("no destructive DROP TABLE", !sql004.includes("drop table"));
  check("no destructive DROP SCHEMA", !sql004.includes("drop schema"));
  check(
    "enables PostGIS extension",
    sql004.includes("create extension if not exists postgis")
  );
  check(
    "adds geometry column to core.dim_geography",
    /alter table core\.dim_geography\s+add column if not exists geom/.test(sql004) &&
      sql004.includes("geometry(multipolygon, 4326)")
  );
  check("creates GIST index on geom", /using gist\s*\(\s*geom\s*\)/.test(sql004));
} else {
  check("migration 004 readable", false, "file not found");
}

console.log("\nMetadata content:");
const registerContent = fs.existsSync(registerPath)
  ? fs.readFileSync(registerPath, "utf8")
  : "";
check(
  "source_register.csv includes abs_asgs",
  registerContent.split(/\r?\n/).some((line) => line.startsWith("abs_asgs,"))
);

const geoDictPath = path.join(repoRoot, "warehouse/metadata/geography_dictionary.csv");
const geoDictContent = fs.existsSync(geoDictPath)
  ? fs.readFileSync(geoDictPath, "utf8")
  : "";
for (const geoType of ["SAL", "POA", "SA2"]) {
  check(
    `geography_dictionary.csv includes ${geoType}`,
    geoDictContent.split(/\r?\n/).some((line) => line.startsWith(`${geoType},`))
  );
}

const planPath = path.join(repoRoot, "warehouse/docs/WAREHOUSE_PLAN.md");
const planContent = fs.existsSync(planPath)
  ? fs.readFileSync(planPath, "utf8").toLowerCase()
  : "";
check(
  "WAREHOUSE_PLAN.md states missing data stays missing",
  planContent.includes("missing data stays missing")
);

console.log("\nMigration 005 sanity:");
const sql005 = readSqlLower("supabase/migrations/005_asgs_staging.sql");
if (sql005 !== null) {
  check("no destructive DROP TABLE", !sql005.includes("drop table"));
  check("no destructive DROP SCHEMA", !sql005.includes("drop schema"));
  check("no TRUNCATE", !sql005.includes("truncate"));
  check("no DELETE", !sql005.includes("delete from"));
  check(
    "creates staging.asgs_geography",
    sql005.includes("create table if not exists staging.asgs_geography")
  );
  check(
    "creates staging.asgs_correspondence",
    sql005.includes("create table if not exists staging.asgs_correspondence")
  );
  check(
    "staging geography has geometry column",
    sql005.includes("geometry(multipolygon, 4326)")
  );
} else {
  check("migration 005 readable", false, "file not found");
}

console.log("\nASGS source manifest:");
const manifestPath = path.join(repoRoot, "warehouse/reports/asgs_source_manifest.json");
if (fs.existsSync(manifestPath)) {
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    check("manifest is valid JSON", false, "parse error");
  }
  if (manifest) {
    check("manifest is valid JSON", Array.isArray(manifest.entries));
    const entries = manifest.entries ?? [];
    const boundaryLevels = new Set(
      entries.filter((e) => e.entry_type === "boundary").map((e) => e.geography_level)
    );
    for (const level of ["STATE", "GCCSA", "SA4", "SA3", "SA2", "SA1", "LGA", "SAL", "POA"]) {
      check(`boundary entry for ${level}`, boundaryLevels.has(level));
    }
    const pairs = new Set(
      entries.filter((e) => e.entry_type === "correspondence").map((e) => e.correspondence_pair)
    );
    for (const pair of ["SA1->SAL", "SA1->POA", "SA1->LGA", "SA2->SAL", "SA2->POA", "SA2->LGA"]) {
      check(`correspondence entry for ${pair}`, pairs.has(pair));
    }
  }
} else {
  check("manifest exists", false, "run discover_asgs_sources.mjs");
}

console.log("\nNo raw data committed:");
try {
  const tracked = execSync(
    'git ls-files -- "*.zip" "*.shp" "*.gpkg" "*.parquet" "*.duckdb" "*.dbf" "warehouse/data" "data"',
    { cwd: repoRoot, encoding: "utf8" }
  ).trim();
  check(
    "no raw/boundary/archive files tracked by git",
    tracked === "",
    tracked ? `tracked: ${tracked.split("\n").slice(0, 5).join(", ")}` : undefined
  );
} catch (err) {
  check("git ls-files raw-data scan", false, `could not run git: ${err.message}`);
}

console.log("");
if (failures > 0) {
  console.error(`warehouse:check FAILED — ${failures} problem(s) found`);
  process.exit(1);
}
console.log("warehouse:check passed — all required warehouse files present");
