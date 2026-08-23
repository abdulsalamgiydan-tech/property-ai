#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prioritise } from "./coverage_engine_core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MATRIX = path.join(ROOT, "warehouse", "reports", "national_source_matrix.json");
const COVERAGE = path.join(ROOT, "warehouse", "reports", "suburb_metric_coverage.json");
const JSON_OUT = path.join(ROOT, "warehouse", "reports", "coverage_prioritisation.json");
const MD_OUT = path.join(ROOT, "warehouse", "reports", "coverage_prioritisation.md");

export function buildPrioritisationReport(matrix, coverage) {
  return {
    generated_at: matrix.as_of,
    evidence_policy: {
      published: "committed warehouse coverage report only",
      verified_local: "parsed, mapped, quality-gated local candidate only",
      estimated: "addressable ceiling/ranking only; never achieved coverage",
    },
    published_baseline: {
      total_suburb_snapshots: coverage.total_suburb_snapshots,
      median_sale_price_overall: coverage.metrics.find((item) => item.metric === "median_sale_price_overall")?.populated ?? 0,
      median_weekly_rent: coverage.metrics.find((item) => item.metric === "median_weekly_rent")?.populated ?? 0,
      gross_yield: coverage.metrics.find((item) => item.metric === "gross_yield")?.populated ?? 0,
      annual_price_growth_12m: coverage.metrics.find((item) => item.metric === "annual_price_growth_12m")?.populated ?? 0,
    },
    ranked_opportunities: prioritise(matrix.sources, coverage),
    production_coverage_changed: false,
  };
}

function markdown(report) {
  const rows = report.ranked_opportunities.map((item, index) =>
    `| ${index + 1} | ${item.source_id} | ${item.jurisdiction} | ${item.metric_family} | ${item.estimated_addressable_ceiling} | ${item.score} | ${item.blockers.join("; ") || "none"} |`,
  ).join("\n");
  return `# Offline coverage prioritisation\n\nAs of: ${report.generated_at}\n\n> Every opportunity below is **estimated only**. Production coverage is unchanged.\n\n## Published baseline\n\n- Suburb snapshots: ${report.published_baseline.total_suburb_snapshots}\n- Sale-price coverage: ${report.published_baseline.median_sale_price_overall}\n- Rent coverage: ${report.published_baseline.median_weekly_rent}\n- Yield coverage: ${report.published_baseline.gross_yield}\n- 12-month growth coverage: ${report.published_baseline.annual_price_growth_12m}\n\n## Ranked opportunity ceilings\n\n| Rank | Source | State | Family | Addressable ceiling | Score | Blockers |\n|---:|---|---|---|---:|---:|---|\n${rows || "| – | None | – | – | 0 | 0 | – |"}\n\nScores rank investigation effort; they are not coverage forecasts or achieved results.\n`;
}

function main() {
  const matrix = JSON.parse(fs.readFileSync(MATRIX, "utf8"));
  const coverage = JSON.parse(fs.readFileSync(COVERAGE, "utf8"));
  const report = buildPrioritisationReport(matrix, coverage);
  if (process.argv.includes("--write")) {
    fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(MD_OUT, markdown(report));
  }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
