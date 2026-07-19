#!/usr/bin/env node
/**
 * ASGS local extraction + inspection (Sprint 2, Part C3).
 *
 * Extracts downloaded boundary zips into the gitignored processed area and
 * inspects every artefact locally (no network, no database):
 *   - shapefiles: layer files present, geometry type from the .shp header,
 *     source CRS from the .prj text, row count from the .dbf header, key
 *     code/name fields from the .dbf field descriptors
 *   - allocation xlsx: sheets, header row, data row count
 *
 * Outputs (committed):
 *   warehouse/reports/asgs_local_file_inspection.json
 *   warehouse/reports/asgs_local_file_inspection.md
 *
 * Raw zips are never modified; extraction targets
 * warehouse/data/processed/asgs/ASGS3_2021/<LEVEL>/ (gitignored).
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const inventoryPath = path.join(repoRoot, "warehouse", "reports", "asgs_download_inventory.json");
const processedRoot = path.join(repoRoot, "warehouse", "data", "processed", "asgs", "ASGS3_2021");
const outJson = path.join(repoRoot, "warehouse", "reports", "asgs_local_file_inspection.json");
const outMd = path.join(repoRoot, "warehouse", "reports", "asgs_local_file_inspection.md");

// bsdtar ships with Windows and extracts zip archives; Git Bash GNU tar does not.
const BSDTAR = "C:\\Windows\\System32\\tar.exe";

const LEVEL_BY_DATASET = {
  asgs_state_2021_boundaries: "STATE",
  asgs_gccsa_2021_boundaries: "GCCSA",
  asgs_sa4_2021_boundaries: "SA4",
  asgs_sa3_2021_boundaries: "SA3",
  asgs_sa2_2021_boundaries: "SA2",
  asgs_sa1_2021_boundaries: "SA1",
  asgs_lga_2021_boundaries: "LGA",
  asgs_sal_2021_boundaries: "SAL",
  asgs_poa_2021_boundaries: "POA",
};

// .shp header shape types (ESRI spec)
const SHP_TYPES = {
  0: "Null", 1: "Point", 3: "PolyLine", 5: "Polygon", 8: "MultiPoint",
  11: "PointZ", 13: "PolyLineZ", 15: "PolygonZ", 18: "MultiPointZ",
  21: "PointM", 23: "PolyLineM", 25: "PolygonM", 28: "MultiPointM", 31: "MultiPatch",
};

if (!fs.existsSync(inventoryPath)) {
  console.error("ERROR: download inventory missing — run download_asgs_sources.mjs first");
  process.exit(1);
}
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync(BSDTAR, ["-xf", zipPath, "-C", destDir], { stdio: "pipe" });
}

function inspectShpHeader(shpPath) {
  const fd = fs.openSync(shpPath, "r");
  const buf = Buffer.alloc(100);
  fs.readSync(fd, buf, 0, 100, 0);
  fs.closeSync(fd);
  return {
    shape_type: SHP_TYPES[buf.readInt32LE(32)] ?? `unknown(${buf.readInt32LE(32)})`,
    bbox: [buf.readDoubleLE(36), buf.readDoubleLE(44), buf.readDoubleLE(52), buf.readDoubleLE(60)]
      .map((v) => Number(v.toFixed(6))),
  };
}

function inspectDbfHeader(dbfPath) {
  const fd = fs.openSync(dbfPath, "r");
  const head = Buffer.alloc(32);
  fs.readSync(fd, head, 0, 32, 0);
  const recordCount = head.readUInt32LE(4);
  const headerLength = head.readUInt16LE(8);
  const fieldArea = Buffer.alloc(headerLength - 32);
  fs.readSync(fd, fieldArea, 0, fieldArea.length, 32);
  fs.closeSync(fd);
  const fields = [];
  for (let off = 0; off + 32 <= fieldArea.length; off += 32) {
    if (fieldArea[off] === 0x0d) break; // field descriptor terminator
    const name = fieldArea.toString("ascii", off, off + 11).replace(/\0.*$/, "");
    fields.push(name);
  }
  return { record_count: recordCount, fields };
}

function detectCrs(prjPath) {
  if (!fs.existsSync(prjPath)) return { crs_text: null, crs_guess: "missing .prj" };
  const wkt = fs.readFileSync(prjPath, "utf8");
  let guess = "unrecognised";
  if (/GDA2020/i.test(wkt)) guess = "GDA2020 (EPSG:7844)";
  else if (/GDA[_ ]?94/i.test(wkt)) guess = "GDA94 (EPSG:4283)";
  else if (/WGS[_ ]?84/i.test(wkt)) guess = "WGS84 (EPSG:4326)";
  return { crs_text: wkt.slice(0, 120), crs_guess: guess };
}

async function inspectXlsx(xlsxPath) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(xlsxPath, {
    entries: "emit", sharedStrings: "cache", styles: "ignore", hyperlinks: "ignore", worksheets: "emit",
  });
  const sheets = [];
  for await (const sheet of wb) {
    let header = null;
    let rows = 0;
    for await (const row of sheet) {
      if (!header) header = row.values.slice(1).map((v) => String(v ?? ""));
      else rows++;
    }
    sheets.push({ header: header ?? [], data_rows: rows });
  }
  return sheets;
}

const results = [];
for (const file of inventory.files) {
  const rawPath = path.join(repoRoot, file.raw_storage_path);
  const entry = {
    dataset_id: file.dataset_id,
    file_name: file.file_name,
    raw_storage_path: file.raw_storage_path,
    sha256: file.sha256,
  };
  if (!fs.existsSync(rawPath)) {
    entry.status = "missing_on_disk";
    results.push(entry);
    continue;
  }

  if (file.file_name.endsWith(".zip")) {
    const level = LEVEL_BY_DATASET[file.dataset_id] ?? file.dataset_id;
    const destDir = path.join(processedRoot, level);
    const already = fs.existsSync(destDir) && fs.readdirSync(destDir).some((f) => f.endsWith(".shp"));
    if (!already) {
      console.log(`extracting ${file.file_name} -> processed/asgs/ASGS3_2021/${level}/`);
      extractZip(rawPath, destDir);
    }
    const members = fs.readdirSync(destDir);
    const shp = members.find((f) => f.toLowerCase().endsWith(".shp"));
    const dbf = members.find((f) => f.toLowerCase().endsWith(".dbf"));
    const prj = members.find((f) => f.toLowerCase().endsWith(".prj"));
    entry.expected_geography_type = level;
    entry.extracted_to = path.relative(repoRoot, destDir).replaceAll("\\", "/");
    entry.layer_files = members;
    if (shp) Object.assign(entry, inspectShpHeader(path.join(destDir, shp)));
    if (dbf) {
      const { record_count, fields } = inspectDbfHeader(path.join(destDir, dbf));
      entry.row_count = record_count;
      entry.dbf_fields = fields;
      entry.key_fields = fields.filter((f) => /CODE|NAME/i.test(f));
    }
    Object.assign(entry, detectCrs(path.join(destDir, prj ?? "__none__")));
    entry.maps_to = "staging.asgs_geography";
    entry.status = shp && dbf ? "inspected" : "incomplete_layer";
  } else if (file.file_name.endsWith(".xlsx")) {
    console.log(`inspecting ${file.file_name} (xlsx)`);
    const sheets = await inspectXlsx(rawPath);
    const main = sheets.reduce((a, b) => (b.data_rows > (a?.data_rows ?? -1) ? b : a), null);
    entry.sheet_count = sheets.length;
    entry.row_count = main?.data_rows ?? 0;
    entry.key_fields = (main?.header ?? []).filter((h) => /CODE|NAME|AREA/i.test(h));
    entry.header = main?.header ?? [];
    entry.maps_to = "staging.asgs_correspondence";
    entry.expected_geography_type = file.dataset_id === "asgs_mb_2021_allocation" ? "MB" : "MB->target";
    entry.status = "inspected";
  } else {
    entry.status = "unknown_format";
  }
  results.push(entry);
}

const out = {
  generated_at: new Date().toISOString(),
  processed_root: "warehouse/data/processed/asgs/ASGS3_2021 (gitignored)",
  files: results,
};
fs.writeFileSync(outJson, JSON.stringify(out, null, 2) + "\n");

const md = `# ASGS Local File Inspection

Generated: ${out.generated_at}
Extraction root: \`${out.processed_root}\`. Raw zips untouched; nothing here is committed
except this report.

| dataset_id | type | rows | geometry | CRS | key fields | maps to | status |
|---|---|---|---|---|---|---|---|
${results
  .map((r) =>
    `| ${r.dataset_id} | ${r.expected_geography_type ?? "—"} | ${r.row_count ?? "—"} | ${r.shape_type ?? "—"} | ${r.crs_guess ?? "—"} | ${(r.key_fields ?? []).join(", ") || "—"} | ${r.maps_to ?? "—"} | ${r.status} |`
  )
  .join("\n")}

Full layer listings, .prj text and xlsx headers: \`asgs_local_file_inspection.json\`.
`;
fs.writeFileSync(outMd, md);
console.log(`\nInspection written for ${results.length} files:`);
console.log("  warehouse/reports/asgs_local_file_inspection.json");
console.log("  warehouse/reports/asgs_local_file_inspection.md");
