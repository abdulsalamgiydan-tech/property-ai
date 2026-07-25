/**
 * Sprint 12, Workstream 8 — lineage query service.
 *
 * Answers "About this metric": given a mart table, a geography_id, and a
 * metric family, returns the full lineage picture by joining the STATIC
 * methodology layer (meta.metric_lineage_registry — which dataset,
 * transformation, correspondence version applies) with the DYNAMIC per-row
 * layer (the mart row's own confidence_label / metric_provenance / period
 * columns — which specific observation this particular geography got).
 *
 * This is a plain query function, not a script with side effects — it can
 * be imported by a future public API route or UI "About this metric" panel
 * (WS12) without pulling in any of the branch-loader safety scaffolding
 * used by write scripts. It takes an already-connected pg client so callers
 * control the connection lifecycle.
 */

const METRIC_FAMILY_COLUMNS = {
  sales: {
    columns: ["sales_volume_12m", "median_sale_price_12m", "annual_price_change_pct", "sales_sample_confidence"],
    confidenceColumn: "sales_sample_confidence",
    periodColumn: "latest_sales_period",
  },
  rent: {
    columns: ["median_weekly_rent_latest", "annual_rent_change_pct", "rent_confidence"],
    confidenceColumn: "rent_confidence",
    periodColumn: "latest_rent_period",
  },
  yield: {
    columns: ["gross_yield_pct", "yield_confidence"],
    confidenceColumn: "yield_confidence",
    periodColumn: "latest_yield_period",
  },
  approvals: {
    columns: ["approvals_12m", "approvals_per_1000_dwellings", "supply_confidence"],
    confidenceColumn: "supply_confidence",
    periodColumn: "latest_approvals_period",
  },
  dwelling_stock: { columns: ["dwelling_stock_total"], confidenceColumn: null, periodColumn: null },
  demographics: {
    columns: ["total_population", "total_households", "median_weekly_household_income"],
    confidenceColumn: null,
    periodColumn: "latest_demographics_period",
  },
  population_growth: { columns: ["population_growth_2016_2021_pct"], confidenceColumn: null, periodColumn: null },
  affordability: {
    columns: ["price_to_income_ratio", "repayment_to_income_pct", "affordability_confidence"],
    confidenceColumn: "affordability_confidence",
    periodColumn: null,
  },
};

export function knownMetricFamilies() {
  return Object.keys(METRIC_FAMILY_COLUMNS);
}

const STATE_TO_JURISDICTION = { "1": "NSW", "2": "VIC", "3": "QLD", "4": "SA", "5": "WA", "6": "TAS", "7": "NT", "8": "ACT" };

/**
 * @param {import('pg').Client} client
 * @param {'suburb_market_snapshot'|'postcode_market_snapshot'} martTable
 * @param {string} geographyId
 * @param {string} metricFamily
 * @param {(poa: string) => string|null} [postcodeToState] required for postcode_market_snapshot lookups
 */
export async function getMetricLineage(client, martTable, geographyId, metricFamily, postcodeToState) {
  const spec = METRIC_FAMILY_COLUMNS[metricFamily];
  if (!spec) throw new Error(`unknown metric family '${metricFamily}' — known: ${knownMetricFamilies().join(", ")}`);

  const selectCols = [
    "d.state_code", "m.metric_provenance", "m.source_periods", "m.confidence_label", "m.data_quality_status",
    ...spec.columns.map((c) => `m.${c}`),
    ...(spec.periodColumn ? [`m.${spec.periodColumn}`] : []),
  ];
  const { rows } = await client.query(
    `select ${selectCols.join(", ")} from mart.${martTable} m
     join core.dim_geography d on d.geography_id = m.geography_id
     where m.geography_id = $1 and m.dwelling_type is null`,
    [geographyId]
  );
  if (rows.length === 0) return { found: false, geographyId, martTable, metricFamily };
  const row = rows[0];

  const state = row.state_code ?? (martTable === "postcode_market_snapshot" && postcodeToState ? postcodeToState(geographyId.replace(/^POA_/, "").split("_")[0]) : null);
  const jurisdiction = state ? STATE_TO_JURISDICTION[state] ?? null : null;

  const { rows: registryRows } = await client.query(
    `select r.*, s.source_name, s.publisher, s.source_url, s.licence, ds.dataset_name, ds.earliest_period, ds.latest_period
     from meta.metric_lineage_registry r
     left join meta.source s on s.source_id = r.source_id
     left join meta.dataset ds on ds.dataset_id = r.dataset_id
     where r.mart_table = $1 and r.metric_name = $2 and r.jurisdiction_code is not distinct from $3`,
    [martTable, metricFamily, jurisdiction]
  );
  // Fall back to the national (NULL-jurisdiction) rule if no jurisdiction-specific rule exists.
  let registryEntry = registryRows[0] ?? null;
  if (!registryEntry && jurisdiction) {
    const { rows: nationalRows } = await client.query(
      `select r.*, s.source_name, s.publisher, s.source_url, s.licence, ds.dataset_name, ds.earliest_period, ds.latest_period
       from meta.metric_lineage_registry r
       left join meta.source s on s.source_id = r.source_id
       left join meta.dataset ds on ds.dataset_id = r.dataset_id
       where r.mart_table = $1 and r.metric_name = $2 and r.jurisdiction_code is null`,
      [martTable, metricFamily]
    );
    registryEntry = nationalRows[0] ?? null;
  }

  const values = {};
  for (const c of spec.columns) values[c] = row[c];

  return {
    found: true,
    geographyId,
    martTable,
    metricFamily,
    jurisdiction,
    values,
    period: spec.periodColumn ? row[spec.periodColumn] : null,
    rowConfidence: spec.confidenceColumn ? row[spec.confidenceColumn] : row.confidence_label,
    dataQualityStatus: row.data_quality_status,
    rowProvenance: row.metric_provenance,
    rowSourcePeriods: row.source_periods,
    methodology: registryEntry
      ? {
          isDerived: registryEntry.is_derived,
          transformationMethod: registryEntry.transformation_method,
          correspondenceVersion: registryEntry.correspondence_version,
          sourceId: registryEntry.source_id,
          sourceName: registryEntry.source_name,
          publisher: registryEntry.publisher,
          sourceUrl: registryEntry.source_url,
          licence: registryEntry.licence,
          datasetId: registryEntry.dataset_id,
          datasetName: registryEntry.dataset_name,
          contributingDatasetIds: registryEntry.contributing_dataset_ids,
          notes: registryEntry.notes,
        }
      : null,
    lineageComplete: registryEntry !== null,
  };
}
