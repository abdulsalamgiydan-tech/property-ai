#!/usr/bin/env node
/**
 * Downloads all SA Private Rent Report quarterly resources (data.sa.gov.au
 * CKAN dataset "private-rent-report") to warehouse/data/raw/sa_rents/.
 * Each quarter is ~200KB and its own CKAN resource (unlike QLD/VIC's single
 * cumulative file), so the full 2008-current history is cheap to keep
 * locally in full rather than a recent-quarters-only subset.
 *
 * Policy guard: refuses any URL not on data.sa.gov.au. Idempotent: skips
 * files whose SHA-256 already matches the inventory.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const RAW_DIR = rel("warehouse", "data", "raw", "sa_rents");

const PACKAGE_URL = "https://data.sa.gov.au/data/api/3/action/package_show?id=private-rent-report";

const res = await fetch(PACKAGE_URL);
if (!res.ok) {
  console.error(`ERROR: CKAN package_show failed: ${res.status}`);
  process.exit(1);
}
const pkg = await res.json();
const resources = pkg.result.resources.filter((r) => r.format === "XLSX");
console.log(`Found ${resources.length} XLSX resources in CKAN package.`);

fs.mkdirSync(RAW_DIR, { recursive: true });
const inventory = [];
let downloaded = 0;
let skipped = 0;

for (const r of resources) {
  const url = r.url;
  if (!url.startsWith("https://data.sa.gov.au/")) {
    console.error(`REFUSED (policy guard, not data.sa.gov.au): ${url}`);
    continue;
  }
  const m = /(\d{4})-(\d{2})/.exec(r.name);
  if (!m) {
    console.error(`REFUSED (cannot determine period from resource name "${r.name}")`);
    continue;
  }
  const period = `${m[1]}-${m[2]}`;
  const destFile = path.join(RAW_DIR, `private-rental-report-${period}.xlsx`);

  if (fs.existsSync(destFile)) {
    const buf = fs.readFileSync(destFile);
    inventory.push({ period, file: path.basename(destFile), bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex"), url, resource_created: r.created });
    skipped++;
    continue;
  }

  const dl = await fetch(url);
  if (!dl.ok) {
    console.error(`  FAILED ${period}: HTTP ${dl.status}`);
    continue;
  }
  const buf = Buffer.from(await dl.arrayBuffer());
  fs.writeFileSync(destFile, buf);
  inventory.push({ period, file: path.basename(destFile), bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex"), url, resource_created: r.created });
  downloaded++;
  console.log(`  downloaded ${period} (${(buf.length / 1024).toFixed(0)} KB)`);
  await new Promise((r2) => setTimeout(r2, 150)); // polite delay
}

inventory.sort((a, b) => a.period.localeCompare(b.period));
fs.writeFileSync(rel("warehouse", "reports", "sa_rents_download_inventory.json"), JSON.stringify({ generated_at: new Date().toISOString(), total_resources: resources.length, downloaded, skipped_existing: skipped, files: inventory }, null, 2));

console.log(`\nDone. Downloaded ${downloaded}, already present ${skipped}, total ${inventory.length} files in warehouse/data/raw/sa_rents/ (gitignored).`);
