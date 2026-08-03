#!/usr/bin/env node
/**
 * Warehouse Coverage Maximiser V1 — deterministic coverage engine (read-only).
 *
 * Reads the metric-definition registry, reproduces current suburb-metric
 * coverage from the public read-only warehouse views, measures what is
 * RECOVERABLE from data already loaded (dry-run — never promises an unmeasured
 * uplift), builds a per-metric gap ledger with a single primary reason code, and
 * ranks the next-best opportunity by measured recoverable count.
 *
 * SAFETY: dry-run by default; makes NO database writes and has NO Production
 * write path. `--apply-local` only permits writing staging/report artifacts to
 * the local filesystem. Fails closed if warehouse creds are missing.
 *
 * Usage:
 *   node warehouse/scripts/coverage/coverage_maximiser.mjs [--state NSW]
 *        [--metric gross_yield] [--out <dir>] [--apply-local]
 */
import fs from "fs";
import path from "path";
import { METRIC_DEFINITIONS } from "../../config/metric_definitions.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
};
const APPLY_LOCAL = flag("apply-local");
const STATE = opt("state", null);
const METRIC = opt("metric", null);
const OUT = opt("out", "warehouse/reports/coverage_maximiser");

function loadEnv() {
  const env = { ...process.env };
  if (fs.existsSync(".env.local")) {
    for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      if (!line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      if (!(k in env)) env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return env;
}
const env = loadEnv();
const URL = env.WAREHOUSE_SUPABASE_URL;
const KEY = env.WAREHOUSE_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error("FAIL CLOSED: WAREHOUSE_SUPABASE_URL / WAREHOUSE_SUPABASE_ANON_KEY not configured.");
  process.exit(1);
}
const BASE = URL.replace(/\/$/, "") + "/rest/v1";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "count=exact" };
const VIEW = "v_suburb_market_snapshot_v1";
// State code filter (ASGS: 1=NSW, 2=VIC) — snapshot view carries state_code.
const STATE_CODE = { NSW: "1", VIC: "2", QLD: "3", SA: "4", WA: "5", TAS: "6", NT: "7", ACT: "8" };

async function count(qs) {
  const stateQ = STATE && STATE_CODE[STATE] ? `&state_code=eq.${STATE_CODE[STATE]}` : "";
  const r = await fetch(`${BASE}/${VIEW}?${qs}${stateQ}&select=geography_id&limit=1`, { method: "HEAD", headers: H });
  const cr = r.headers.get("content-range") || "";
  return cr.includes("/") ? Number(cr.split("/")[1]) : NaN;
}

// Gap-reason assignment for a metric with no direct coverage recovery available.
function primaryReason(def, recoverable) {
  if (def.kind === "unsourced") return "no_reusable_source";
  if (recoverable > 0) return "calculation_inputs_missing"; // recoverable now
  if (def.kind === "derived") return "calculation_inputs_missing";
  return "source_not_ingested";
}

async function main() {
  const total = await count("");
  const defs = METRIC_DEFINITIONS.filter((m) => !METRIC || m.key === METRIC);
  const rows = [];

  for (const def of defs) {
    let directPopulated = 0;
    let naiveOverlap = 0;
    let naiveReason = null;

    if (def.column) {
      directPopulated = await count(`${def.column}=not.is.null`);
    }

    // NAIVE price+rent / input overlap — an UNQUALIFIED upper bound only. It is
    // NOT recoverable coverage: each candidate must pass the full lineage
    // contract (lib/warehouse/yieldLineage.ts). The NSW yield lineage audit
    // requalified all 126 naive overlaps to 0 promotion-ready. Never project an
    // uplift from this number.
    if (def.key === "gross_yield") {
      naiveOverlap = await count("median_sale_price_12m=not.is.null&median_weekly_rent_latest=not.is.null&gross_yield_pct=is.null");
      naiveReason = "naive price+rent overlap — NOT lineage-qualified (aggregate 'all'; no upstream obs ids/samples). Audit: 0 promotion-ready.";
    } else if (def.key === "growth_12m") {
      naiveOverlap = await count("median_sale_price_12m=not.is.null&median_sale_price_prev_12m=not.is.null&annual_price_change_pct=is.null");
      naiveReason = "prior-period median is 0% populated in the snapshot — recovery requires reprocessing sales history (timeseries)";
    } else if (def.key.startsWith("growth_") && def.key.includes("yr")) {
      naiveOverlap = 0;
      naiveReason = "requires rolling-window medians from sales history (timeseries, DB read)";
    }

    const missing = total - directPopulated;
    rows.push({
      metric: def.key,
      label: def.label,
      unit: def.unit,
      kind: def.kind,
      all_sal_denominator: total,
      direct_populated: directPopulated,
      naive_price_rent_overlap: naiveOverlap, // UNQUALIFIED upper bound, not coverage
      qualified_recoverable: 0, // requires the lineage audit; 0 provable from the read-only contract
      missing,
      coverage_pct: total ? Number(((directPopulated / total) * 100).toFixed(1)) : 0,
      primary_reason: directPopulated >= total ? "complete" : primaryReason(def, naiveOverlap),
      naive_overlap_reason: naiveReason,
    });
  }

  // Rank naive opportunities (explicitly NOT qualified uplift — each needs the lineage audit).
  const opportunities = rows
    .filter((r) => r.naive_price_rent_overlap > 0)
    .sort((a, b) => b.naive_price_rent_overlap - a.naive_price_rent_overlap)
    .map((r) => ({ metric: r.metric, naive_overlap: r.naive_price_rent_overlap, qualified_recoverable: 0, why: r.naive_overlap_reason }));

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY_LOCAL ? "apply-local" : "dry-run",
    state_filter: STATE,
    view: VIEW,
    total_sal: total,
    metrics: rows,
    ranked_opportunities: opportunities,
    note: "naive_price_rent_overlap is an UNQUALIFIED upper bound, NOT recoverable coverage. The NSW yield lineage audit requalified all 126 naive yield overlaps to 0 promotion-ready. No uplift is projected from naive overlaps. No values were written.",
  };

  // ── console (human) ──
  console.log(`\nCoverage Maximiser — ${APPLY_LOCAL ? "APPLY-LOCAL" : "DRY-RUN"} — ${total.toLocaleString()} SAL${STATE ? ` (state ${STATE})` : ""}\n`);
  console.log("metric".padEnd(26) + "direct".padStart(9) + "naive".padStart(8) + "qual.".padStart(7) + "cover%".padStart(8) + "  primary reason");
  for (const r of rows) {
    console.log(
      r.metric.padEnd(26) +
        String(r.direct_populated).padStart(9) +
        String(r.naive_price_rent_overlap).padStart(8) +
        String(r.qualified_recoverable).padStart(7) +
        `${r.coverage_pct}`.padStart(8) +
        `  ${r.primary_reason}`
    );
  }
  if (opportunities.length) {
    console.log(`\nLargest naive overlap: ${opportunities[0].metric} (${opportunities[0].naive_overlap} price+rent overlaps) — qualified_recoverable=0 until the lineage audit qualifies them. ${opportunities[0].why}`);
  } else {
    console.log("\nNo naive overlaps; remaining gaps need new source ingestion.");
  }

  // ── machine-readable + CSV + MD ──
  if (APPLY_LOCAL) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "coverage_maximiser.json"), JSON.stringify(report, null, 2));
    const csv = ["metric,label,unit,kind,all_sal,direct_populated,naive_price_rent_overlap,qualified_recoverable,missing,coverage_pct,primary_reason"]
      .concat(rows.map((r) => [r.metric, `"${r.label}"`, r.unit, r.kind, r.all_sal_denominator, r.direct_populated, r.naive_price_rent_overlap, r.qualified_recoverable, r.missing, r.coverage_pct, r.primary_reason].join(",")))
      .join("\n");
    fs.writeFileSync(path.join(OUT, "coverage_maximiser.csv"), csv);
    const md = [`# Coverage Maximiser report (${report.mode})`, "", `Generated ${report.generated_at} · ${total.toLocaleString()} SAL · view \`${VIEW}\``, "", "> \`naive_price_rent_overlap\` is an UNQUALIFIED upper bound, not coverage. \`qualified_recoverable\` is 0 until the lineage audit qualifies candidates.", "", "| metric | direct | naive overlap | qualified | coverage % | primary reason |", "|---|--:|--:|--:|--:|---|"]
      .concat(rows.map((r) => `| ${r.label} | ${r.direct_populated} | ${r.naive_price_rent_overlap} | ${r.qualified_recoverable} | ${r.coverage_pct}% | ${r.primary_reason} |`))
      .join("\n");
    fs.writeFileSync(path.join(OUT, "coverage_maximiser.md"), md);
    console.log(`\nWrote JSON/CSV/MD to ${OUT}/ (local artifacts only — no DB write).`);
  } else {
    console.log("\n[dry-run] pass --apply-local to write JSON/CSV/MD report artifacts locally. No DB write in any mode.");
  }
}

main().catch((e) => {
  console.error("Coverage Maximiser failed:", e.message);
  process.exit(1);
});
