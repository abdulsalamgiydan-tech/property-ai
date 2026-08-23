#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseWaPropertySales, EXPECTED_SCHEMA_FINGERPRINT } from "../../adapters/wa_property_sales/parse.mjs";
import { NORMALISED_ROWS, SPINE_FIXTURE } from "../../adapters/wa_property_sales/fixtures.mjs";
import { toCanonicalObservations } from "../../adapters/wa_property_sales/normalize.mjs";
import { runLocalQualityGates } from "../quality/local_quality_gates.mjs";
import { simulate } from "./coverage_engine_core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const COVERAGE = path.join(ROOT, "warehouse", "reports", "suburb_metric_coverage.json");
const JSON_OUT = path.join(ROOT, "warehouse", "reports", "coverage_review_packet.json");
const MD_OUT = path.join(ROOT, "warehouse", "reports", "coverage_review_packet.md");
const FIXTURE_PAYLOAD = `${JSON.stringify(NORMALISED_ROWS, null, 2)}\n`;
const FIXTURE_SHA = crypto.createHash("sha256").update(FIXTURE_PAYLOAD).digest("hex");

export function buildReviewPacket(coverage) {
  const parsed = parseWaPropertySales(NORMALISED_ROWS, { retrievedAt: "2026-08-23T00:00:00Z", resourceSha: FIXTURE_SHA });
  const observations = [];
  const mappingQuarantine = [];
  for (const record of parsed.records) {
    const result = toCanonicalObservations(record, SPINE_FIXTURE);
    if (result.ok) observations.push(...result.observations);
    else mappingQuarantine.push({ suburb: record.suburb, reason: result.reason });
  }
  const gates = runLocalQualityGates({
    sourceId: "wa_property_sales",
    expectedSourceId: "wa_property_sales",
    sourceLicence: "CC BY 4.0",
    expectedLicence: "CC BY 4.0",
    schemaFingerprint: parsed.schemaFingerprint,
    priorSchemaFingerprint: EXPECTED_SCHEMA_FINGERPRINT,
    fileMeta: { mime: "text/csv", bytes: 900, looksHtml: false, complete: true },
    rows: observations,
    quarantined: [...parsed.quarantined, ...mappingQuarantine],
  });
  const simulation = simulate({ coverage, candidateObservations: observations });
  const quarantineRows = [
    ...parsed.quarantined.map((row) => ({ stage: "parser", suburb: row.suburb, reason: row.quarantine_reason })),
    ...mappingQuarantine.map((row) => ({ stage: "mapping", ...row })),
  ];
  const quarantineByReason = Object.fromEntries(
    [...new Set(quarantineRows.map((row) => row.reason))].sort().map((reason) => [reason, quarantineRows.filter((row) => row.reason === reason).length]),
  );
  const fixturePeriods = observations.map((row) => row.reportingPeriod).sort();
  return {
    generated_at: "2026-08-23",
    source_id: "wa_property_sales",
    source_status: "fixture-verified candidate; official live resource schema not yet matched",
    admission: {
      local_quality_gates_pass: gates.admit,
      publishable: false,
      blockers: [
        "official machine-readable resource/header not acquired",
        "candidate exposes weekly count/turnover, not median sale price",
        "no validation-branch database run approved or performed",
      ],
    },
    candidate_evidence: {
      accepted_observations: observations.length,
      candidate_geography_ids: [...new Set(observations.map((row) => row.geographyId))].sort(),
      parser_quarantine: parsed.quarantined.map((row) => ({ suburb: row.suburb, reason: row.quarantine_reason })),
      mapping_quarantine: mappingQuarantine,
      candidate_fixture_checksum: FIXTURE_SHA,
      checksum_scope: "SHA-256 of the committed sanitised NORMALISED_ROWS JSON payload; not an official resource checksum",
      schema_fingerprint: parsed.schemaFingerprint,
    },
    source_freshness: {
      classification: "fixture_only_not_a_live_refresh",
      earliest_reporting_period: fixturePeriods[0] ?? null,
      latest_reporting_period: fixturePeriods.at(-1) ?? null,
      acquired_at: "2026-08-23T00:00:00Z",
    },
    licence: {
      catalogue_status: "verified_reusable",
      name: "Creative Commons Attribution 4.0 (catalogue listing)",
      live_resource_licence_matched: false,
    },
    quarantine: {
      total: quarantineRows.length,
      by_reason: quarantineByReason,
      rows: quarantineRows,
    },
    coverage: simulation,
    state_and_national: {
      national: simulation.metrics,
      WA: {
        current_published_source_attributed: null,
        verified_local_candidate_geographies: [...new Set(observations.map((row) => row.geographyId))].sort(),
        verified_local_candidate_metrics: Object.fromEntries(
          [...new Set(observations.map((row) => row.metric))].sort().map((metric) => [metric, new Set(observations.filter((row) => row.metric === metric).map((row) => row.geographyId)).size]),
        ),
        estimated_only: 0,
        note: "The committed baseline has no state/source-attributed geography-ID set, so overlap and exact newly-covered WA IDs remain unresolved.",
      },
    },
    fully_covered_snapshots: {
      current_published: null,
      verified_local_candidate: 0,
      reason: "Aggregate baseline counts do not contain the geography-ID intersections needed to prove full price+rent+yield+growth coverage.",
    },
    still_missing: simulation.metrics.map((row) => ({ metric: row.metric, national_unavailable: row.unavailable })),
    expected_production_publish_delta: 0,
    proposed_future_write_scope: {
      approved_now: false,
      tables: [],
      rows: 0,
      upsert_keys: [],
      validation_command: null,
      status: "not_proposed_until_live_resource_and_destination_schema_are_reviewed",
    },
    rollback_plan: "If a future validation load is approved, delete only rows matching source_id + file checksum; no such rows exist now.",
    production_coverage_changed: false,
  };
}

function markdown(packet) {
  return `# Coverage review packet — WA weekly sales candidate\n\nAs of: ${packet.generated_at}\n\n## Decision\n\n- Local gates: ${packet.admission.local_quality_gates_pass ? "PASS" : "FAIL"}\n- Publishable: **NO**\n- Production publish delta: **0**\n- Production coverage changed: **NO**\n\n## Verified local evidence\n\n- Accepted canonical observations: ${packet.candidate_evidence.accepted_observations}\n- Candidate SAL IDs: ${packet.candidate_evidence.candidate_geography_ids.join(", ") || "none"}\n- Parser quarantines: ${packet.candidate_evidence.parser_quarantine.length}\n- Mapping quarantines: ${packet.candidate_evidence.mapping_quarantine.length}\n- Sanitised fixture payload checksum: \`${packet.candidate_evidence.candidate_fixture_checksum}\`\n- Checksum scope: ${packet.candidate_evidence.checksum_scope}\n- Freshness: ${packet.source_freshness.classification} (${packet.source_freshness.latest_reporting_period ?? "no period"})\n- Licence: ${packet.licence.name}; live resource match = ${packet.licence.live_resource_licence_matched}\n\nThese candidate metrics are weekly sales count and turnover. They are **not** median prices and cannot unlock price, yield, or growth coverage. Exact new-WA overlap remains unresolved because the committed baseline contains aggregate counts, not state/source geography-ID sets.\n\n## Quarantine summary\n\n${Object.entries(packet.quarantine.by_reason).map(([reason, count]) => `- ${reason}: ${count}`).join("\n")}\n\n## Blocking conditions\n\n${packet.admission.blockers.map((item) => `- ${item}`).join("\n")}\n\n## Future write scope\n\nNo tables, zero rows and no executable validation command are approved in this packet. A separate validation-branch approval is required.\n`;
}

function main() {
  const coverage = JSON.parse(fs.readFileSync(COVERAGE, "utf8"));
  const packet = buildReviewPacket(coverage);
  if (process.argv.includes("--write")) {
    fs.writeFileSync(JSON_OUT, `${JSON.stringify(packet, null, 2)}\n`);
    fs.writeFileSync(MD_OUT, markdown(packet));
  }
  console.log(JSON.stringify(packet, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
