/**
 * Shared helpers for the SA (data.sa.gov.au, CC BY) XLSX adapters.
 * Parsers operate on a plain 2D array of cell values so they are pure and
 * fixture-testable; `loadXlsxRows` is the only side-effecting reader.
 */
import ExcelJS from "exceljs";

/** `*` in the SA reports marks a privacy-suppressed small count (1–2 bonds/sales). */
export function isSuppressed(v) {
  return v === "*" || v === "**";
}

/** Coerce a cell to a positive number, or null (blank / suppressed / non-numeric). */
export function num(v) {
  if (v == null || v === "" || isSuppressed(v)) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function str(v) {
  return v == null ? "" : String(v).trim();
}

/** Reads a worksheet into a 1-indexed-flattened 2D array (row 0 unused kept null). */
export async function loadXlsxRows(filePath, sheetName, maxCols = 27) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`sheet '${sheetName}' not found in ${filePath}`);
  const out = [];
  for (let i = 1; i <= ws.rowCount; i++) {
    const vals = ws.getRow(i).values.slice(1, maxCols + 1).map((v) => (v && typeof v === "object" && v.result !== undefined ? v.result : v ?? null));
    out.push(vals);
  }
  return out;
}

/** Extract a period end (ISO) from an SA quarter label like "Median 2Q 2026" or "2026-03". */
export function quarterEndFromLabel(label) {
  const s = String(label);
  let m = s.match(/([1-4])Q\s*(\d{4})/i);
  if (m) return `${m[2]}-${{ 1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31" }[Number(m[1])]}`;
  m = s.match(/(\d{4})-(\d{2})/);
  if (m) {
    const q = { "03": "03-31", "06": "06-30", "09": "09-30", "12": "12-31" }[m[2]];
    if (q) return `${m[1]}-${q}`;
  }
  return null;
}
