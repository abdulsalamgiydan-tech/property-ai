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
  acquired_at_utc: "2026-08-23T04:15:09.123Z",
  acquired_at_source: "fresh_get",
  final_url: "https://data.sa.gov.au/.../lsg_stats_2026_2q.xlsx",
  final_host: "data.sa.gov.au",
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  bytes: 37459,
  sha256: "9cfa8aa71d2c453c09ca1d3baecc1955144863cfb5c4caef01c12266e639ef7a",
  etag: '"1784275937"',
  last_modified: "Fri, 17 Jul 2026 08:12:17 GMT",
  schema_fingerprint: schemaFingerprint(REAL_ROWS[0]),
  generated_at: "2026-08-23T04:15:10.000Z",
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

  it("classifies price DIRECT and growth DERIVED (never all-direct), and never fabricates yield", () => {
    expect(evidence.classification.direct).toBe(2); // 2 price rows
    expect(evidence.classification.derived).toBe(2); // 2 growth rows
    expect(evidence.classification.direct + evidence.classification.derived).toBe(evidence.counts.accepted_observations);
    expect(evidence.classification.unavailable_note).toMatch(/yield/i);
  });

  it("holds every reconciliation accounting invariant", () => {
    const a = evidence.accounting;
    expect(Object.values(a.invariants).every(Boolean)).toBe(true);
    // fixture: 6 data rows, 2 parser-accepted, 4 parser-quarantined, 0 geo-rejected
    expect(a.source_data_rows_scanned).toBe(a.parser_accepted_source_rows + a.parser_quarantined_source_rows);
    expect(a.mapped_source_rows).toBe(a.parser_accepted_source_rows - a.geography_quarantined_source_rows);
    expect(a.unique_canonical_geographies + a.duplicate_source_rows).toBe(a.mapped_source_rows);
    expect(a.emitted_observations_before_dedup).toBe(a.accepted_observations_after_dedup + a.deduplicated_observations + a.conflict_events);
    expect(a.source_data_rows_scanned).toBe(
      a.parser_quarantined_source_rows + a.geography_quarantined_source_rows + a.unique_canonical_geographies + a.duplicate_source_rows,
    );
  });

  it("documents an exact, compatible target table and non-conflating transforms", () => {
    const tc = evidence.target_compatibility;
    expect(tc.schema_supports_batch).toBe(true);
    expect(tc.target_table).toMatch(/core\.official_observation/);
    expect(tc.upsert_keys.mart).toBe("(geography_id, metric, property_type, bedroom_group, period_end)");
    const price = tc.metric_transforms.find((t: { candidate_metric: string }) => t.candidate_metric === "median_sale_price_detached");
    expect(price.target_metric).toBe("median_house_price");
    expect(price.property_type).toBe("house");
    // must NOT claim it feeds the overall 12m price or the main snapshot column
    expect(JSON.stringify(tc)).not.toMatch(/median_sale_price_12m['"]?\s*:/);
    expect(tc.serving.main_price_card_unchanged).toMatch(/do not change/i);
    const growth = tc.metric_transforms.find((t: { candidate_metric: string }) => t.candidate_metric === "annual_price_growth_12m");
    expect(growth.target_metric).toBe("price_growth_12m");
    expect(growth.status).toBe("derived");
  });

  it("preserves the real acquisition timestamp separately from as_of and generated_at", () => {
    expect(evidence.acquired_at_utc).toBe("2026-08-23T04:15:09.123Z");
    expect(evidence.as_of).toBe("2026-08-23");
    expect(evidence.reporting_period_end).toBe("2026-06-30");
    expect(evidence.acquired_at_utc).not.toBe(`${evidence.as_of}T00:00:00Z`);
    expect(evidence.acquisition.acquired_at_utc).toBe("2026-08-23T04:15:09.123Z");
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
