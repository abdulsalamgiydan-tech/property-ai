#!/usr/bin/env node
/**
 * ASGS controlled download (Sprint 2, Part C2).
 *
 * Downloads the manifest-approved ABS ASGS Edition 3 artefacts into the
 * gitignored raw area and records size + SHA-256 + URL + timestamp for each
 * file in a committed inventory report.
 *
 * Policy (enforced in code):
 *   - official ABS only: any URL not on https://www.abs.gov.au/ is refused
 *   - only manifest entries with status "discovered" and a concrete
 *     expected_file_name are eligible — nothing is guessed
 *   - raw files land under warehouse/data/raw/asgs/ASGS3_2021/ (gitignored);
 *     only the inventory (hashes/URLs/sizes) is committed
 *   - idempotent: files already on disk whose recomputed SHA-256 matches the
 *     inventory are skipped; partial downloads go to <file>.part first
 *   - no database is contacted and no secrets are read
 *
 * Usage:
 *   node download_asgs_sources.mjs [--dry-run] [--only <dataset_id>]
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const manifestPath = path.join(repoRoot, "warehouse", "reports", "asgs_source_manifest.json");
const inventoryJsonPath = path.join(repoRoot, "warehouse", "reports", "asgs_download_inventory.json");
const inventoryMdPath = path.join(repoRoot, "warehouse", "reports", "asgs_download_inventory.md");

const DRY_RUN = process.argv.includes("--dry-run");
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;
const POLITE_DELAY_MS = 2000;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(manifestPath)) fail("manifest missing — run discover_asgs_sources.mjs first");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// Eligible = concrete downloadable artefact, verified, with a raw storage path.
// Multiple manifest entries can point at the same physical file (e.g. the three
// SA1 correspondences all need their target xlsx); dedupe on storage path.
const eligible = [];
const seenPaths = new Set();
for (const e of manifest.entries) {
  if (e.status !== "discovered") continue;
  if (!e.expected_file_name || !e.intended_raw_storage_path) continue;
  if (ONLY && e.dataset_id !== ONLY) continue;
  if (seenPaths.has(e.intended_raw_storage_path)) continue;
  seenPaths.add(e.intended_raw_storage_path);
  eligible.push(e);
}

const notDiscovered = manifest.entries.filter((e) => e.status !== "discovered");
if (notDiscovered.length > 0 && !ONLY) {
  fail(`manifest has unresolved entries (${notDiscovered.map((e) => e.dataset_id).join(", ")}) — resolve before downloading`);
}
if (eligible.length === 0) fail(ONLY ? `no downloadable manifest entry matches --only ${ONLY}` : "nothing eligible to download");

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

// Existing inventory lets re-runs skip verified files.
let inventory = { generated_at: null, raw_root: manifest.policy.raw_files_outside_git, files: [] };
if (fs.existsSync(inventoryJsonPath)) {
  inventory = JSON.parse(fs.readFileSync(inventoryJsonPath, "utf8"));
}
const byPath = new Map(inventory.files.map((f) => [f.raw_storage_path, f]));

async function download(url, destPath) {
  if (!url.startsWith("https://www.abs.gov.au/")) {
    throw new Error("non-ABS URL refused by policy");
  }
  const headerController = new AbortController();
  const headerTimer = setTimeout(() => headerController.abort(), 60000);
  const res = await fetch(url, { redirect: "follow", signal: headerController.signal });
  clearTimeout(headerTimer);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const expectedBytes = res.headers.get("content-length")
    ? Number(res.headers.get("content-length"))
    : null;

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const partPath = `${destPath}.part`;
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  const counter = async function* (source) {
    for await (const chunk of source) {
      bytes += chunk.length;
      hash.update(chunk);
      yield chunk;
    }
  };
  await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(partPath));
  if (expectedBytes !== null && bytes !== expectedBytes) {
    fs.rmSync(partPath, { force: true });
    throw new Error(`size mismatch: got ${bytes} bytes, Content-Length said ${expectedBytes}`);
  }
  fs.renameSync(partPath, destPath);
  return { bytes, sha256: hash.digest("hex") };
}

console.log(`ASGS controlled download — ${eligible.length} file(s) eligible${DRY_RUN ? " (DRY RUN)" : ""}`);

const results = [];
let downloadedBytes = 0;
for (const entry of eligible) {
  const destPath = path.join(repoRoot, entry.intended_raw_storage_path);
  const label = `${entry.dataset_id} <- ${entry.expected_file_name}`;

  const prior = byPath.get(entry.intended_raw_storage_path);
  if (fs.existsSync(destPath) && prior?.sha256) {
    const currentHash = await sha256File(destPath);
    if (currentHash === prior.sha256) {
      console.log(`  skip  ${label} (already downloaded, SHA-256 verified)`);
      results.push({ ...prior, action: "skipped_verified" });
      continue;
    }
    console.log(`  WARN  ${label}: on-disk hash differs from inventory — re-downloading`);
  }

  if (DRY_RUN) {
    console.log(`  would ${label}\n        from ${entry.official_url}`);
    continue;
  }

  process.stdout.write(`  get   ${label} ... `);
  try {
    const { bytes, sha256 } = await download(entry.official_url, destPath);
    downloadedBytes += bytes;
    console.log(`${(bytes / 1024 / 1024).toFixed(1)} MB ok`);
    results.push({
      dataset_id: entry.dataset_id,
      entry_type: entry.entry_type,
      file_name: entry.expected_file_name,
      source_url: entry.official_url,
      raw_storage_path: entry.intended_raw_storage_path,
      size_bytes: bytes,
      sha256,
      downloaded_at: new Date().toISOString(),
      boundary_version: entry.boundary_version,
      reference_period: manifest.reference_period,
      licence_notes: entry.licence_notes,
      action: "downloaded",
    });
  } catch (err) {
    console.log(`FAILED (${err.message})`);
    fail(`download failed for ${entry.dataset_id}: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
}

if (DRY_RUN) {
  console.log("\nDry run complete — nothing downloaded, nothing written.");
  process.exit(0);
}

// Merge results into the inventory (replace rows for re-downloaded paths).
for (const r of results) byPath.set(r.raw_storage_path, { ...r, action: undefined });
const files = [...byPath.values()].map((f) => {
  const clean = { ...f };
  delete clean.action;
  return clean;
});
files.sort((a, b) => a.raw_storage_path.localeCompare(b.raw_storage_path));
const out = {
  generated_at: new Date().toISOString(),
  edition: manifest.edition,
  boundary_version: manifest.boundary_version,
  raw_root: "warehouse/data/raw/asgs/ASGS3_2021",
  policy: {
    official_abs_only: true,
    raw_files_gitignored: true,
    committed_artifact: "hashes + URLs + sizes only, never the files",
  },
  files,
};
fs.writeFileSync(inventoryJsonPath, JSON.stringify(out, null, 2) + "\n");

const totalMB = (files.reduce((s, f) => s + f.size_bytes, 0) / 1024 / 1024).toFixed(1);
const md = `# ASGS Download Inventory

Generated: ${out.generated_at}
Edition: ${out.edition} (boundary_version \`${out.boundary_version}\`)
Files: ${files.length}, total ${totalMB} MB. Raw storage: \`${out.raw_root}\` (gitignored —
only this inventory is committed).

| dataset_id | file | size (MB) | sha256 | downloaded_at |
|---|---|---|---|---|
${files
  .map(
    (f) =>
      `| ${f.dataset_id} | ${f.file_name} | ${(f.size_bytes / 1024 / 1024).toFixed(1)} | \`${f.sha256.slice(0, 16)}…\` | ${f.downloaded_at.slice(0, 19)}Z |`
  )
  .join("\n")}

Full SHA-256 hashes: \`asgs_download_inventory.json\`. Licence: CC BY 4.0 (ABS attribution).
`;
fs.writeFileSync(inventoryMdPath, md);

console.log(`\nInventory written (${files.length} files, ${totalMB} MB total, ${(downloadedBytes / 1024 / 1024).toFixed(1)} MB fetched this run):`);
console.log("  warehouse/reports/asgs_download_inventory.json");
console.log("  warehouse/reports/asgs_download_inventory.md");
