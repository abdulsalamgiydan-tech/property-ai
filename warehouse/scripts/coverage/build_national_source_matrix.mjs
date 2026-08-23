#!/usr/bin/env node
/**
 * Deterministically enrich the national source matrix with the full audit
 * contract required by the coverage engine. Unknowns stay explicit/null; the
 * builder never turns an investigation estimate into warehouse evidence.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MATRIX_PATH = path.join(ROOT, "warehouse", "reports", "national_source_matrix.json");
const REGISTRY_PATH = path.join(ROOT, "warehouse", "config", "v3_source_registry.json");
const COVERAGE_PATH = path.join(ROOT, "warehouse", "reports", "suburb_metric_coverage.json");

const METRICS_BY_FAMILY = {
  context: ["geography_spine", "dwelling_stock", "population"],
  sales: ["median_sale_price", "sales_volume", "price_growth_12m"],
  rent: ["median_weekly_rent"],
  weekly_sales_context: ["weekly_property_sales_count", "weekly_property_sales_turnover"],
  sales_and_rent: ["median_sale_price", "median_weekly_rent", "gross_yield", "price_growth_12m"],
};

function baselineCount(source, coverage) {
  if (source.metric_family === "context") return coverage.total_suburb_snapshots ?? null;
  const metric = source.metric_family === "sales"
    ? "median_sale_price_overall"
    : source.metric_family === "rent"
      ? "median_weekly_rent"
      : null;
  if (!metric) return null;
  return coverage.metrics.find((item) => item.metric === metric)?.populated ?? null;
}

function accessLabel(mode) {
  if (mode === "live_public") return "public_https_metadata_get";
  if (mode === "manual_inbox") return "human_download_then_local_inbox";
  if (mode === "existing_pipeline") return "existing_repository_pipeline";
  return "discovery_only_no_acquisition";
}

function authenticationLabel(mode) {
  if (mode === "live_public") return "none";
  if (mode === "manual_inbox") return "portal access may require a human browser; no automation or circumvention";
  if (mode === "existing_pipeline") return "source-specific; not exercised by Phase 2A";
  return "not applicable or unresolved";
}

function impactFor(source) {
  if (source.metric_family === "context") {
    return { price: "none", rent: "none", yield: "none", growth: "none", note: "Geography/demographic context supports mapping but is not market evidence." };
  }
  if (source.metric_family === "weekly_sales_context") {
    return { price: "none", rent: "none", yield: "none", growth: "none", note: "Context facts cannot be reinterpreted as medians or valuations." };
  }
  if (source.metric_family === "sales") {
    return { price: "potential_direct", rent: "none", yield: "conditional_on_comparable_rent", growth: "conditional_on_12_month_comparable_series" };
  }
  if (source.metric_family === "rent") {
    return { price: "none", rent: "potential_direct", yield: "conditional_on_comparable_price", growth: "none" };
  }
  return { price: "unavailable", rent: "unavailable", yield: "unavailable", growth: "unavailable" };
}

export function enrichMatrix(matrix, registry, coverage) {
  const registryById = new Map(registry.map((source) => [source.id, source]));
  return {
    ...matrix,
    field_contract_version: "national-source-matrix@1",
    field_contract_note: "Null means not evidenced in committed artifacts; it never means zero.",
    sources: matrix.sources.map((source) => {
      const registered = registryById.get(source.source_id) ?? {};
      const mode = source.acquisition.mode;
      const estimated = Number(source.priority?.estimated_addressable_geographies ?? 0);
      const verifiedLocal = source.source_id === "wa_property_sales" ? 2 : null;
      return {
        ...source,
        dataset_name: registered.name ?? source.source_id,
        landing_url: registered.landing ?? source.acquisition.url ?? null,
        resource_url: registered.resource_url ?? (mode === "live_public" ? source.acquisition.url : null),
        geography_level: registered.geography_level ?? "unresolved_or_not_applicable",
        property_types: registered.property_types ?? [],
        metrics: METRICS_BY_FAMILY[source.metric_family] ?? [],
        history: registered.history ?? "not_evidenced",
        cadence: registered.cadence ?? "not_evidenced",
        format: registered.format ?? source.acquisition.expected_kind ?? "not_evidenced",
        access_method: registered.access ?? accessLabel(mode),
        authentication: authenticationLabel(mode),
        accessibility: {
          mode,
          phase_2a_action: accessLabel(mode),
          reusable_licence_verified: source.licence.status === "verified_reusable",
          remote_database_required: false,
        },
        schema: {
          status: source.source_id === "wa_property_sales"
            ? "sanitised_normalised_fixture_only_live_header_unmatched"
            : registered.parser_version
              ? "adapter_or_pipeline_registered"
              : "not_verified",
          expected_kind: source.acquisition.expected_kind,
        },
        suppression: (registered.blocker ?? source.blockers.join(" ")).match(/suppress/i)
          ? "suppression_is_explicitly_quarantined_or_reported"
          : "not_evidenced_or_not_applicable",
        adapter: {
          status: source.disposition,
          version: registered.parser_version ?? null,
          phase_2a_new_adapter: source.source_id === "wa_property_sales",
        },
        warehouse_coverage: {
          evidence: source.evidence,
          source_attributed_geography_count: null,
          relevant_national_metric_baseline: baselineCount(source, coverage),
          baseline_report: "warehouse/reports/suburb_metric_coverage.json",
          note: "The committed baseline is national and is not attributed to this source row.",
        },
        last_refresh: {
          source_specific: null,
          status: "not_source_attributed_in_committed_baseline",
          baseline_report_generated_at: coverage.generated_at,
        },
        suburbs_unlocked: {
          published_source_attributed: null,
          verified_local_candidate: verifiedLocal,
          estimated_only_ceiling: estimated,
          warning: "Estimated and verified-local values are not published coverage.",
        },
        impact: impactFor(source),
        effort: source.priority?.effort ?? null,
        risk: {
          licence: source.licence.status,
          blockers: source.blockers,
        },
      };
    }),
  };
}

function main() {
  const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, "utf8"));
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  const coverage = JSON.parse(fs.readFileSync(COVERAGE_PATH, "utf8"));
  const enriched = enrichMatrix(matrix, registry, coverage);
  fs.writeFileSync(MATRIX_PATH, `${JSON.stringify(enriched, null, 2)}\n`);
  console.log(JSON.stringify({ sources: enriched.sources.length, field_contract_version: enriched.field_contract_version, production_coverage_changed: false }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
