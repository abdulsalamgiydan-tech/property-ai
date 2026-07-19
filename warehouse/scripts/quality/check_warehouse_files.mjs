#!/usr/bin/env node
/**
 * Warehouse skeleton validation (Sprint 1).
 * Verifies required folders, metadata/config files, migration 003,
 * and the source_register.csv header row. Exits non-zero on failure.
 *
 * Run: npm run warehouse:check
 */

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

console.log("\nMigration 003 sanity:");
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/003_warehouse_foundation.sql"
);
if (fs.existsSync(migrationPath)) {
  const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();
  for (const schema of ["meta", "raw", "staging", "core", "mart", "audit"]) {
    check(
      `creates schema ${schema}`,
      sql.includes(`create schema if not exists ${schema}`)
    );
  }
  check("no destructive DROP TABLE", !sql.includes("drop table"));
  check("no destructive DROP SCHEMA", !sql.includes("drop schema"));
} else {
  check("migration file readable", false, "file not found");
}

console.log("");
if (failures > 0) {
  console.error(`warehouse:check FAILED — ${failures} problem(s) found`);
  process.exit(1);
}
console.log("warehouse:check passed — all required warehouse files present");
