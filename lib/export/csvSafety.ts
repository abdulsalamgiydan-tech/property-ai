/**
 * CSV/formula-injection-safe cell escaping (CWE-1236). A STRING cell
 * value that starts with =, +, -, @, tab or CR is interpreted as a
 * formula by Excel/Sheets/LibreOffice when the file is opened —
 * dangerous when a cell can ever contain user-controlled free text
 * (watchlist notes, scenario labels, report names), which several
 * Sprint 13 exports now do. Prefixing a leading apostrophe neutralises
 * the formula while keeping the value visible/readable (standard
 * OWASP-recommended mitigation), and CSV-quoting still applies
 * underneath it as before.
 *
 * Deliberately scoped to `typeof v === "string"` only: a genuine JS
 * `number` (e.g. a negative cashflow figure) can never itself carry
 * formula syntax, and escaping it would corrupt legitimate numeric
 * exports by turning real numbers into text in the opened spreadsheet.
 * The attack surface is string fields, not numeric ones.
 */
const FORMULA_TRIGGER_CHARS = ["=", "+", "-", "@", "\t", "\r"];

export function csvCell(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  let s = v;
  if (FORMULA_TRIGGER_CHARS.some((c) => s.startsWith(c))) {
    s = `'${s}`;
  }
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
