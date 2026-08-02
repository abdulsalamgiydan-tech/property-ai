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
    let recoverable = 0;
    let recoverableReason = null;

    if (def.column) {
      directPopulated = await count(`${def.column}=not.is.null`);
    }

    // Measured recoverability from data already loaded (dry-run):
    if (def.key === "gross_yield") {
      // suburb price + suburb rent present, yield null → recoverable via formula
      recoverable = await count("median_sale_price_12m=not.is.null&median_weekly_rent_latest=not.is.null&gross_yield_pct=is.null");
      recoverableReason = "same-geography price+rent present, yield not computed";
    } else if (def.key === "growth_12m") {
      // needs a prior 12m median; measure how many have both current + prior
      recoverable = await count("median_sale_price_12m=not.is.null&median_sale_price_prev_12m=not.is.null&annual_price_change_pct=is.null");
      recoverableReason = "prior-period median absent in snapshot — recovery requires reprocessing sales history (timeseries)";
    } else if (def.key.startsWith("growth_") && def.key.includes("yr")) {
      recoverable = 0; // requires bulk timeseries reprocessing — not measurable from snapshot view
      recoverableReason = "requires rolling-window medians from sales history (timeseries dry-run, DB read)";
    }

    const missing = total - directPopulated;
    rows.push({
      metric: def.key,
      label: def.label,
      unit: def.unit,
      kind: def.kind,
      all_sal_denominator: total,
      direct_populated: directPopulated,
      recoverable_now: recoverable,
      missing,
      coverage_pct: total ? Number(((directPopulated / total) * 100).toFixed(1)) : 0,
      projected_after_recovery_pct: total ? Number((((directPopulated + recoverable) / total) * 100).toFixed(1)) : 0,
      primary_reason: primaryReason(def, recoverable),
      recoverable_reason: recoverableReason,
    });
  }

  // Rank the next-best opportunity by measured recoverable count.
  const opportunities = rows
    .filter((r) => r.recoverable_now > 0)
    .sort((a, b) => b.recoverable_now - a.recoverable_now)
    .map((r) => ({ metric: r.metric, recoverable_now: r.recoverable_now, why: r.recoverable_reason }));

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY_LOCAL ? "apply-local" : "dry-run",
    state_filter: STATE,
    view: VIEW,
    total_sal: total,
    metrics: rows,
    ranked_opportunities: opportunities,
    note: "Dry-run measures current + recoverable coverage from already-loaded data. No values were written. Multi-year growth requires reprocessing sales history and is reported as a blocker, not an uplift.",
  };

  // ── console (human) ──
  console.log(`\nCoverage Maximiser — ${APPLY_LOCAL ? "APPLY-LOCAL" : "DRY-RUN"} — ${total.toLocaleString()} SAL${STATE ? ` (state ${STATE})` : ""}\n`);
  console.log("metric".padEnd(26) + "direct".padStart(9) + "recov.".padStart(8) + "cover%".padStart(8) + "→after".padStart(8) + "  reason");
  for (const r of rows) {
    console.log(
      r.metric.padEnd(26) +
        String(r.direct_populated).padStart(9) +
        String(r.recoverable_now).padStart(8) +
        `${r.coverage_pct}`.padStart(8) +
        `${r.projected_after_recovery_pct}`.padStart(8) +
        `  ${r.primary_reason}`
    );
  }
  if (opportunities.length) {
    console.log(`\nNext-best opportunity: ${opportunities[0].metric} (+${opportunities[0].recoverable_now} suburbs recoverable now) — ${opportunities[0].why}`);
  } else {
    console.log("\nNo recoverable uplift measurable from already-loaded data; remaining gaps need new source ingestion.");
  }

  // ── machine-readable + CSV + MD ──
  if (APPLY_LOCAL) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "coverage_maximiser.json"), JSON.stringify(report, null, 2));
    const csv = ["metric,label,unit,kind,all_sal,direct_populated,recoverable_now,missing,coverage_pct,projected_after_recovery_pct,primary_reason"]
      .concat(rows.map((r) => [r.metric, `"${r.label}"`, r.unit, r.kind, r.all_sal_denominator, r.direct_populated, r.recoverable_now, r.missing, r.coverage_pct, r.projected_after_recovery_pct, r.primary_reason].join(",")))
      .join("\n");
    fs.writeFileSync(path.join(OUT, "coverage_maximiser.csv"), csv);
    const md = [`# Coverage Maximiser report (${report.mode})`, "", `Generated ${report.generated_at} · ${total.toLocaleString()} SAL · view \`${VIEW}\``, "", "| metric | direct | recoverable now | coverage % | →after | primary reason |", "|---|--:|--:|--:|--:|---|"]
      .concat(rows.map((r) => `| ${r.label} | ${r.direct_populated} | ${r.recoverable_now} | ${r.coverage_pct}% | ${r.projected_after_recovery_pct}% | ${r.primary_reason} |`))
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
