#!/usr/bin/env node
/**
 * Manual official-file inbox for access-controlled portals.
 *
 * Reads gitignored warehouse/data/inbox, validates file identity/magic, matches a
 * registered source and runs the relevant parser in dry-run. `--ingest` writes
 * only a local inspection manifest; it cannot contact a database or publish.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { atomicWrite } from "./immutableCore.mjs";
import { loadSourceMatrix, looksLikeHtml, MATRIX_PATH, REPO_ROOT } from "./acquisition_engine.mjs";
import { parseVicPropertySales } from "../../adapters/vic_vg_property_sales/parse.mjs";

export const DEFAULT_INBOX = path.join(REPO_ROOT, "warehouse", "data", "inbox");
export const DEFAULT_MANIFEST_DIR = path.join(REPO_ROOT, "warehouse", "data", "local", "inbox-manifests");

function extensionKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".xlsx" ? "xlsx" : ext === ".csv" ? "csv" : ext === ".json" ? "json" : "unknown";
}

export function inspectFileBytes(buffer, expectedKind, { minBytes = 1, maxBytes = 50 * 1024 * 1024 } = {}) {
  if (buffer.length === 0) return { ok: false, reason: "empty_file" };
  if (buffer.length < minBytes) return { ok: false, reason: `file_below_minimum_${minBytes}_bytes` };
  if (buffer.length > maxBytes) return { ok: false, reason: `file_above_maximum_${maxBytes}_bytes` };
  if (looksLikeHtml(buffer)) return { ok: false, reason: "html_masquerading_as_data" };
  if (expectedKind === "xlsx" && !(buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)) {
    return { ok: false, reason: "xlsx_zip_magic_missing" };
  }
  if (expectedKind === "csv" && !buffer.toString("utf8").split(/\r?\n/, 1)[0]?.includes(",")) return { ok: false, reason: "csv_header_missing" };
  return { ok: true };
}

export function matchInboxFile(filePath, sources) {
  const name = path.basename(filePath);
  const candidates = sources.filter((source) => {
    if (source.acquisition?.mode !== "manual_inbox") return false;
    const patterns = source.acquisition.filename_patterns ?? [];
    return patterns.some((pattern) => new RegExp(pattern, "i").test(name));
  });
  if (candidates.length === 0) return { ok: false, reason: "no_registered_source_match" };
  if (candidates.length > 1) return { ok: false, reason: "ambiguous_registered_source_match", candidates: candidates.map((item) => item.source_id) };
  const source = candidates[0];
  const actualKind = extensionKind(filePath);
  if (actualKind !== source.acquisition.expected_kind) return { ok: false, reason: `wrong_extension_${actualKind}` };
  return { ok: true, source };
}

export function evaluateVicRows(rows, options = {}) {
  const parsed = parseVicPropertySales(rows, options);
  return {
    accepted: !parsed.drift && parsed.records.length > 0,
    drift: parsed.drift,
    driftReason: parsed.driftReason ?? null,
    acceptedRows: parsed.records.length,
    quarantinedRows: parsed.quarantined.length,
  };
}

async function rowsFromXlsx(filePath) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  for (const sheet of workbook.worksheets) {
    const rows = [];
    sheet.eachRow((row) => rows.push(row.values.slice(1, 6).map((value) => value ?? "")));
    for (let index = 0; index < Math.min(rows.length, 40); index++) {
      const candidate = rows.slice(index);
      const result = parseVicPropertySales(candidate, {});
      if (!result.drift) return candidate;
    }
  }
  return [];
}

export async function inspectInboxFile(filePath, sources) {
  const match = matchInboxFile(filePath, sources);
  if (!match.ok) return { file: path.basename(filePath), ...match };
  const buffer = fs.readFileSync(filePath);
  const integrity = inspectFileBytes(buffer, match.source.acquisition.expected_kind, {
    minBytes: match.source.acquisition.min_bytes ?? 1,
    maxBytes: match.source.acquisition.max_bytes ?? 50 * 1024 * 1024,
  });
  if (!integrity.ok) return { file: path.basename(filePath), source_id: match.source.source_id, ...integrity };
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  let adapter = { accepted: false, reason: "no_adapter_registered" };
  if (match.source.source_id === "vic_vg_property_sales") {
    const rows = await rowsFromXlsx(filePath);
    adapter = evaluateVicRows(rows, { retrievedAt: new Date().toISOString(), resourceSha: sha256 });
  }
  return {
    ok: adapter.accepted,
    file: path.basename(filePath),
    source_id: match.source.source_id,
    sha256,
    bytes: buffer.length,
    adapter,
    publishable: false,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--ingest");
  const matrix = args.includes("--matrix") ? args[args.indexOf("--matrix") + 1] : MATRIX_PATH;
  const sources = loadSourceMatrix(matrix);
  const files = fs.existsSync(DEFAULT_INBOX)
    ? fs.readdirSync(DEFAULT_INBOX).map((name) => path.join(DEFAULT_INBOX, name)).filter((item) => fs.statSync(item).isFile())
    : [];
  const inspections = [];
  for (const file of files) inspections.push(await inspectInboxFile(file, sources));
  const report = { mode: write ? "ingest_local_manifest" : "dry-run", files_written: write ? inspections.length : 0, database_writes: 0, publishable: false, inspections };
  if (write) {
    fs.mkdirSync(DEFAULT_MANIFEST_DIR, { recursive: true });
    for (const item of inspections) {
      const id = item.sha256?.slice(0, 12) ?? crypto.createHash("sha256").update(item.file).digest("hex").slice(0, 12);
      atomicWrite(path.join(DEFAULT_MANIFEST_DIR, `${id}.json`), `${JSON.stringify(item, null, 2)}\n`);
    }
  }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
