/**
 * Shared JS↔PGlite parity fixtures. Each fixture describes both inputs' full
 * evidence and the expected `qualified` verdict. The same fixture drives:
 *   - the JS canonical qualifier (lib/warehouse/yieldLineage.mjs), and
 *   - a real PostgreSQL row set validated by contractViolationsSql (PGlite).
 * promotion_sql.test.ts asserts both agree for every fixture — so the SQL
 * contract is provably equivalent to the JS contract.
 */

export const PARITY_AS_OF = "2026-08-02";

/** A fully-qualifying input; overrides produce rejected variants. */
function input(over = {}) {
  return {
    observationId: "obs_x",
    observationVerified: true,
    geographyId: "SAL_1_ASGS3_2021",
    asgsVersion: "ASGS3_2021",
    geographyLevel: "suburb",
    directStatus: "direct",
    sourceContract: "accepted",
    provenanceVerified: true,
    sourceId: "src",
    qualityStatus: "passed",
    propertyType: "house",
    bedroomGroup: "3",
    aggregateBedroomLegitimate: false,
    sampleSize: 40,
    periodStart: "2025-07-01",
    periodEnd: "2026-06-30",
    value: 600000,
    quarantined: false,
    ...over,
  };
}

export const FIXTURES = [
  { name: "accepted_house", expectedQualified: true, price: input({ observationId: "p1" }), rent: input({ observationId: "r1", value: 550 }) },
  { name: "accepted_all_legit_aggregate", expectedQualified: true,
    price: input({ observationId: "p2", bedroomGroup: "all", aggregateBedroomLegitimate: true }),
    rent: input({ observationId: "r2", value: 550, bedroomGroup: "all", aggregateBedroomLegitimate: true }) },
  { name: "reject_property_all", expectedQualified: false, price: input({ observationId: "p3", propertyType: "all" }), rent: input({ observationId: "r3", value: 550, propertyType: "all" }) },
  { name: "reject_type_mismatch", expectedQualified: false, price: input({ observationId: "p4", propertyType: "house" }), rent: input({ observationId: "r4", value: 550, propertyType: "unit" }) },
  { name: "reject_bedroom_mismatch", expectedQualified: false, price: input({ observationId: "p5", bedroomGroup: "3" }), rent: input({ observationId: "r5", value: 550, bedroomGroup: "2" }) },
  { name: "reject_bedroom_all_not_legit", expectedQualified: false, price: input({ observationId: "p6", bedroomGroup: "all" }), rent: input({ observationId: "r6", value: 550, bedroomGroup: "all" }) },
  { name: "reject_low_sample", expectedQualified: false, price: input({ observationId: "p7", sampleSize: 4 }), rent: input({ observationId: "r7", value: 550 }) },
  { name: "reject_provenance_unverified", expectedQualified: false, price: input({ observationId: "p8", provenanceVerified: false }), rent: input({ observationId: "r8", value: 550 }) },
  { name: "reject_observation_unverified", expectedQualified: false, price: input({ observationId: "p9", observationVerified: false }), rent: input({ observationId: "r9", value: 550 }) },
  { name: "reject_source_contract", expectedQualified: false, price: input({ observationId: "p10", sourceContract: null }), rent: input({ observationId: "r10", value: 550 }) },
  { name: "reject_quality", expectedQualified: false, price: input({ observationId: "p11", qualityStatus: "quarantine_review" }), rent: input({ observationId: "r11", value: 550 }) },
  { name: "reject_quarantined", expectedQualified: false, price: input({ observationId: "p12", quarantined: true }), rent: input({ observationId: "r12", value: 550 }) },
  { name: "reject_stale", expectedQualified: false, price: input({ observationId: "p13", periodStart: "2019-01-01", periodEnd: "2020-01-01" }), rent: input({ observationId: "r13", value: 550 }) },
  { name: "reject_window_ratio", expectedQualified: false, price: input({ observationId: "p14" }), rent: input({ observationId: "r14", value: 550, periodStart: "2026-06-29", periodEnd: "2026-06-30" }) },
  { name: "reject_asgs_mismatch", expectedQualified: false, price: input({ observationId: "p15", asgsVersion: "ASGS3_2021" }), rent: input({ observationId: "r15", value: 550, asgsVersion: "ASGS2_2016" }) },
  { name: "reject_non_direct_rent", expectedQualified: false, price: input({ observationId: "p16" }), rent: input({ observationId: "r16", value: 550, directStatus: "derived" }) },
  { name: "reject_negative_value", expectedQualified: false, price: input({ observationId: "p17" }), rent: input({ observationId: "r17", value: -1 }) },
];

/** JS evidence for the canonical qualifier. */
export function toEvidence(fx) {
  return { price: fx.price, rent: fx.rent };
}

/** Ordered values for an INSERT into core.market_observation (DDL column order). */
export function observationValues(ev) {
  return [
    ev.observationId, ev.observationVerified, ev.geographyId, ev.asgsVersion, ev.geographyLevel,
    ev.directStatus, ev.sourceContract, ev.provenanceVerified, ev.sourceId, ev.qualityStatus,
    ev.propertyType, ev.bedroomGroup, ev.aggregateBedroomLegitimate, ev.sampleSize,
    ev.periodStart, ev.periodEnd, ev.value, ev.quarantined,
  ];
}

/** Ordered values for an INSERT into mart.suburb_yield_recovered. */
export function martValues(fx) {
  const p = fx.price, r = fx.rent;
  const yieldPct = p.value > 0 ? Number(((r.value * 52) / p.value) * 100).toFixed(2) : 0;
  return [p.geographyId, yieldPct, p.propertyType, p.bedroomGroup, p.observationId, r.observationId, "gross_yield@2", "direct"];
}
