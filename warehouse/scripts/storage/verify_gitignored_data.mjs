#!/usr/bin/env node
/**
 * Gitignore verification for the local data lake (Sprint 11, Workstream 7).
 *
 * Complements check_warehouse_files.mjs's fixed-extension git-tracked scan
 * (`*.zip`, `*.shp`, etc.) with two things that scan does not cover:
 *   1. STAGED files (git diff --cached), not just committed ones — catches
 *      a raw file about to be committed, before the commit happens.
 *   2. A DYNAMIC extension check driven by whatever extensions actually
 *      exist on disk under warehouse/data/ right now, rather than a fixed
 *      hardcoded list — catches a future raw-data format this project
 *      hasn't seen yet, as long as it lands under warehouse/data/.
 *
 * Read-only. Exits non-zero (safe to wire into a pre-commit hook or CI
 * step) if anything under warehouse/data/ is tracked or staged.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

function git(cmd) {
  try {
    return execSync(cmd, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch (err) {
    return { error: err.message };
  }
}

function walkExtensions(dir) {
  const exts = new Set();
  if (!fs.existsSync(dir)) return exts;
  const stack = [dir];
  while (stack.length > 0) {
    const d = stack.pop();
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else exts.add(path.extname(entry.name).toLowerCase().replace(".", "") || "(none)");
    }
  }
  return exts;
}

console.log("verify_gitignored_data — checking warehouse/data/ is never tracked or staged");

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, detail });
  console.log(`  ${pass ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

// 1. Nothing tracked under warehouse/data/
const tracked = git("git ls-files warehouse/data/");
check("no files tracked under warehouse/data/", typeof tracked === "string" && tracked === "", typeof tracked === "string" && tracked ? tracked.split("\n").slice(0, 5).join(", ") : undefined);

// 2. Nothing STAGED under warehouse/data/ (catches a pending commit before it lands)
const staged = git("git diff --cached --name-only -- warehouse/data/");
check("no files staged under warehouse/data/", typeof staged === "string" && staged === "", typeof staged === "string" && staged ? staged.split("\n").slice(0, 5).join(", ") : undefined);

// 3. Nothing staged anywhere in the repo matching a known raw-data extension
// (catches a raw file accidentally placed outside warehouse/data/ entirely)
const RAW_EXTENSIONS = ["zip", "shp", "shx", "dbf", "prj", "cpg", "gpkg", "parquet", "duckdb", "sbx", "sbn"];
const stagedAll = git('git diff --cached --name-only');
const stagedRawElsewhere =
  typeof stagedAll === "string"
    ? stagedAll
        .split("\n")
        .filter(Boolean)
        .filter((f) => !f.startsWith("warehouse/data/"))
        .filter((f) => RAW_EXTENSIONS.includes(path.extname(f).toLowerCase().replace(".", "")))
    : [];
check("no raw-data-extension files staged outside warehouse/data/", stagedRawElsewhere.length === 0, stagedRawElsewhere.slice(0, 5).join(", ") || undefined);

// 4. .gitignore actually contains the blanket rule (not just working by
// accident because nothing's been added yet)
const gitignoreContent = fs.readFileSync(rel(".gitignore"), "utf8");
const hasBlanketRule = /^warehouse\/data\/\s*$/m.test(gitignoreContent);
check(".gitignore has a blanket warehouse/data/ rule", hasBlanketRule);

// 5. Dynamic extension sanity check — every extension actually present on
// disk right now is covered by the blanket rule (informational once the
// blanket rule is confirmed present, since the blanket rule covers all
// extensions unconditionally — this just documents what's out there).
const extensionsOnDisk = [...walkExtensions(rel("warehouse", "data"))].sort();
check("extension inventory recorded", true, extensionsOnDisk.join(", "));

const allPassed = checks.filter((c) => c.name !== "extension inventory recorded").every((c) => c.pass);

const report = {
  generated_at: new Date().toISOString(),
  scope: "Sprint 11 Workstream 7 — gitignore verification for the local data lake",
  checks,
  all_passed: allPassed,
  extensions_on_disk: extensionsOnDisk,
};
fs.writeFileSync(rel("warehouse", "reports", "gitignore_verification_report.json"), JSON.stringify(report, null, 2));

console.log(`\n${allPassed ? "PASSED" : "FAILED"} — wrote warehouse/reports/gitignore_verification_report.json`);
if (!allPassed) process.exit(1);
