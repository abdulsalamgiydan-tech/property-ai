import { describe, expect, it } from "vitest";
import { buildReviewPacket } from "./simulate_coverage.mjs";

const coverage = {
  total_suburb_snapshots: 15_334,
  metrics: [
    { metric: "median_sale_price_overall", populated: 4_821 },
    { metric: "median_weekly_rent", populated: 3_089 },
    { metric: "gross_yield", populated: 453 },
    { metric: "annual_price_growth_12m", populated: 735 },
  ],
};

describe("coverage review packet", () => {
  it("admits the fixture locally but approves zero publication", () => {
    const packet = buildReviewPacket(coverage);
    expect(packet.admission.local_quality_gates_pass).toBe(true);
    expect(packet.admission.publishable).toBe(false);
    expect(packet.expected_production_publish_delta).toBe(0);
    expect(packet.proposed_future_write_scope).toMatchObject({ approved_now: false, rows: 0, tables: [] });
    expect(packet.production_coverage_changed).toBe(false);
    expect(packet.candidate_evidence.candidate_fixture_checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(packet.candidate_evidence.checksum_scope).toMatch(/not an official resource checksum/);
    expect(packet.quarantine.total).toBe(5);
    expect(packet.state_and_national.WA.current_published_source_attributed).toBeNull();
    expect(packet.fully_covered_snapshots.current_published).toBeNull();
    expect(packet.proposed_future_write_scope.validation_command).toBeNull();
  });

  it("keeps median/rent/yield/growth published baselines unchanged", () => {
    const packet = buildReviewPacket(coverage);
    for (const metric of ["median_sale_price", "median_rent", "gross_yield", "price_growth_12m"]) {
      const row = packet.coverage.metrics.find((item) => item.metric === metric);
      expect(row.after_published).toBe(row.current_published);
      expect(row.verified_local_candidate).toBe(0);
    }
  });
});
