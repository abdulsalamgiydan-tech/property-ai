import { describe, expect, it } from "vitest";
import { REAL_ROWS, SPINE_FIXTURE } from "../../adapters/sa_metro_house_sales/fixtures.mjs";
import { assembleCoverage, pickLatestResource, quarterRank, schemaFingerprint } from "./sa_metro_house_price_uplift.mjs";

const BASELINE = {
  total_suburb_snapshots: 15334,
  metrics: [
    { metric: "median_house_price", column: "median_sale_price_detached", populated: 4756 },
    { metric: "median_sale_price_overall", column: "median_sale_price_12m", populated: 4821 },
  ],
};

const ACQ = {
  retrieved_at_utc: "2026-08-23T00:00:00Z",
  final_url: "https://data.sa.gov.au/.../lsg_stats_2026_2q.xlsx",
  final_host: "data.sa.gov.au",
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  bytes: 37459,
  sha256: "9cfa8aa71d2c453c09ca1d3baecc1955144863cfb5c4caef01c12266e639ef7a",
  etag: '"1784275937"',
  last_modified: "Fri, 17 Jul 2026 08:12:17 GMT",
  schema_fingerprint: schemaFingerprint(REAL_ROWS[0]),
  generated_at: "2026-08-23T00:00:00Z",
};

const SOURCE = {
  name: "Metropolitan Median House Sales Q2 2026",
  url: "https://data.sa.gov.au/.../lsg_stats_2026_2q.xlsx",
  licence: "Creative Commons Attribution | cc-by",
  licence_url: "https://creativecommons.org/licenses/by/4.0/",
  last_modified: null,
};

describe("SA uplift runner — resource discovery", () => {
  it("ranks quarters and picks the latest XLSX", () => {
    expect(quarterRank("Metropolitan Median House Sales Q2 2026")).toBe(20262);
    expect(quarterRank("lsg_stats_2025_q4.xlsx")).toBe(20254);
    const picked = pickLatestResource({
      license_title: "Creative Commons Attribution", license_id: "cc-by", license_url: "https://creativecommons.org/licenses/by/4.0/",
      resources: [
        { name: "Metropolitan Median House Sales Q4 2025", url: "a/lsg_stats_2025_q4.xlsx", format: "XLSX" },
        { name: "Metropolitan Median House Sales Q2 2026", url: "a/lsg_stats_2026_2q.xlsx", format: "XLSX" },
        { name: "readme", url: "a/readme.pdf", format: "PDF" },
      ],
    });
    expect(picked.name).toBe("Metropolitan Median House Sales Q2 2026");
    expect(picked.licence).toContain("cc-by");
  });
});

describe("SA uplift runner — assembleCoverage (pure, offline)", () => {
  const evidence = assembleCoverage({ rows: REAL_ROWS, salList: SPINE_FIXTURE, baseline: BASELINE, source: SOURCE, acquisition: ACQ, asOf: "2026-08-23" });

  it("passes the quality gates and reports honest counts", () => {
    expect(evidence.drift).not.toBe(true);
    expect(evidence.production_coverage_changed).toBe(false);
    expect(evidence.quality_gates.admit).toBe(true);
    // BELAIR + STIRLING map; price=2, growth=2
    expect(evidence.counts.accepted_by_metric).toEqual({ median_sale_price_detached: 2, annual_price_growth_12m: 2 });
    expect(evidence.counts.unique_mapped_asgs_ids).toBe(2);
    // ADELAIDE, ALDGATE, ASHTON, BALHANNAH quarantined at parse
    expect(evidence.counts.quarantine_by_reason.reduce((n, r) => n + r.count, 0)).toBe(evidence.counts.quarantined_total);
  });

  it("classifies everything DIRECT and never fabricates yield", () => {
    expect(evidence.classification.direct).toBe(evidence.counts.accepted_observations);
    expect(evidence.classification.derived).toBe(0);
    expect(evidence.classification.unavailable_note).toMatch(/yield/i);
  });

  it("labels the SAL geography level and the trusted spine artifact", () => {
    expect(evidence.geography.level).toBe("SAL");
    expect(evidence.geography.spine_artifact).toBe("warehouse/metadata/sa_all_sals.json");
  });

  it("reports candidate footprint honestly (no net-new claim, production unchanged)", () => {
    expect(evidence.candidate_footprint.net_new_provable).toBe(false);
    expect(evidence.candidate_footprint.production_overlap).toBe("unknown");
    expect(evidence.coverage_simulation.production_coverage_changed).toBe(false);
    // fixture has only 2 mapped → materiality target not met on the tiny fixture
    expect(evidence.materiality.met).toBe(false);
  });

  it("is deterministic — a second assembly is byte-identical", () => {
    const again = assembleCoverage({ rows: REAL_ROWS, salList: SPINE_FIXTURE, baseline: BASELINE, source: SOURCE, acquisition: ACQ, asOf: "2026-08-23" });
    expect(JSON.stringify(again.counts)).toBe(JSON.stringify(evidence.counts));
  });

  it("fails closed on schema drift", () => {
    const drift = assembleCoverage({ rows: [["City", "Locality", "x", "y", "z", "w", "c"], ["A", "B", 1, 2, 3, 4, 5]], salList: SPINE_FIXTURE, baseline: BASELINE, source: SOURCE, acquisition: ACQ, asOf: "2026-08-23" });
    expect(drift.drift).toBe(true);
  });
});
