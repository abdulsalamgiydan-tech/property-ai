import { describe, expect, it } from "vitest";
import { DRIFTED_ROWS, REAL_ROWS } from "../../adapters/vic_vg_property_sales/fixtures.mjs";
import { evaluateVicRows, inspectFileBytes, matchInboxFile } from "./inbox_ingest.mjs";

const sources = [{
  source_id: "vic_vg_property_sales",
  acquisition: {
    mode: "manual_inbox",
    expected_kind: "xlsx",
    filename_patterns: ["vic.*property.*sales.*\\.xlsx$", "property-sales-statistics.*\\.xlsx$"],
  },
}];

describe("manual acquisition inbox", () => {
  it("matches an expected official filename and rejects unknown/ambiguous files", () => {
    expect(matchInboxFile("vic-property-sales-2026-q2.xlsx", sources)).toMatchObject({ ok: true, source: { source_id: "vic_vg_property_sales" } });
    expect(matchInboxFile("random.xlsx", sources)).toMatchObject({ ok: false, reason: "no_registered_source_match" });
    expect(matchInboxFile("vic-property-sales.csv", sources)).toMatchObject({ ok: false });
    expect(matchInboxFile("vic-property-sales.xlsx", [...sources, { ...sources[0], source_id: "duplicate" }])).toMatchObject({ ok: false, reason: "ambiguous_registered_source_match" });
  });

  it("checks XLSX magic and rejects HTML soft errors", () => {
    expect(inspectFileBytes(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "xlsx")).toEqual({ ok: true });
    expect(inspectFileBytes(Buffer.from("<!doctype html><html>blocked</html>"), "xlsx")).toEqual({ ok: false, reason: "html_masquerading_as_data" });
    expect(inspectFileBytes(Buffer.from("not-a-zip"), "xlsx")).toEqual({ ok: false, reason: "xlsx_zip_magic_missing" });
    expect(inspectFileBytes(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "xlsx", { minBytes: 5 })).toEqual({ ok: false, reason: "file_below_minimum_5_bytes" });
    expect(inspectFileBytes(Buffer.alloc(6, 0x50), "xlsx", { maxBytes: 5 })).toEqual({ ok: false, reason: "file_above_maximum_5_bytes" });
  });

  it("runs VIC rows through the real parser and fails closed on drift", () => {
    expect(evaluateVicRows(REAL_ROWS, { retrievedAt: "2026-08-23", resourceSha: "a".repeat(64) })).toMatchObject({ accepted: true, drift: false, acceptedRows: 3 });
    expect(evaluateVicRows(DRIFTED_ROWS)).toMatchObject({ accepted: false, drift: true, acceptedRows: 0 });
  });
});
