/**
 * Parser: SA Metropolitan Median House Sales (data.sa.gov.au, CC BY).
 * Source: https://data.sa.gov.au/data/dataset/metro-median-house-sales
 * Real schema (Sheet1): City | Suburb | Sales <prevQ> | Median <prevQ> |
 *                       Sales <curQ> | Median <curQ> | Median Change
 *
 * Direct suburb HOUSE median price + sale count + a published 1-year change,
 * metropolitan Adelaide only. Schema-drift-safe (validates header structurally
 * and derives the quarter from the labels), every row validated, quarantines
 * suppressed/invalid rows with a reason. Never fabricates a missing value.
 */
import { num, str, quarterEndFromLabel } from "../sa_common.mjs";

export const PARSER_VERSION = "sa_metro_house_sales@1";
export const SOURCE_ID = "sa_metro_median_house_sales";
export const MIN_SALES = 10; // registry minSample for a defensible median

export function parseSaHouseSales(rows, { retrievedAt, resourceSha }) {
  if (!Array.isArray(rows) || rows.length < 2) return { drift: true, driftReason: "no rows", records: [], quarantined: [] };
  const h = rows[0].map(str);
  const shapeOk =
    h[0] === "City" && h[1] === "Suburb" &&
    /^Sales /.test(h[2]) && /^Median /.test(h[3]) && /^Sales /.test(h[4]) && /^Median /.test(h[5]) && /Change/i.test(h[6] || "");
  if (!shapeOk) return { drift: true, driftReason: `schema drift: unexpected header ${JSON.stringify(h)}`, records: [], quarantined: [] };

  const priorPeriodEnd = quarterEndFromLabel(h[3]);
  const currentPeriodEnd = quarterEndFromLabel(h[5]);
  if (!currentPeriodEnd || !priorPeriodEnd) return { drift: true, driftReason: "cannot derive quarter from header labels", records: [], quarantined: [] };

  const records = [];
  const quarantined = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const suburb = str(r[1]);
    if (!suburb) continue;
    const median = num(r[5]);
    const sales = num(r[4]);
    const priorMedian = num(r[3]);
    const priorSales = num(r[2]);
    // Source-published 1-year "Median Change" (column h[6]), a signed RATIO
    // (e.g. -0.1874 = -18.74%). This is a DIRECT source-reported figure — the
    // publisher's own change column — not something we compute. Preserved with sign.
    const medianChange = num(r[6]);
    const base = {
      source_id: SOURCE_ID, resource_sha: resourceSha, parser_version: PARSER_VERSION,
      state: "SA", city: str(r[0]), suburb, property_type: "house", bedroom_group: "all", aggregate_bedroom_legitimate: true,
      current_period_end: currentPeriodEnd, prior_period_end: priorPeriodEnd, retrieved_at: retrievedAt,
      house_median: median, sales_count: sales, prior_house_median: priorMedian, prior_sales_count: priorSales,
      median_change: medianChange,
    };
    if (median == null || median <= 0) { quarantined.push({ ...base, quarantine_reason: "non_positive_or_suppressed_median" }); continue; }
    if (sales == null || sales < MIN_SALES) { quarantined.push({ ...base, quarantine_reason: "insufficient_sample" }); continue; }
    records.push(base);
  }
  return { drift: false, currentPeriodEnd, priorPeriodEnd, records, quarantined };
}
