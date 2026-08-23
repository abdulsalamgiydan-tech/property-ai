/**
 * Pure offline coverage math. Evidence classes are deliberately separate:
 *   published       committed warehouse report only
 *   verified_local  parsed + normalised candidate rows only
 *   estimated       opportunity ceiling only
 *
 * No function in this module can write or publish data.
 */

const COVERAGE_METRIC_MAP = {
  median_sale_price: "median_sale_price_overall",
  median_rent: "median_weekly_rent",
  gross_yield: "gross_yield",
  price_growth_12m: "annual_price_growth_12m",
};

function coverageCount(coverage, metric) {
  const reportMetric = COVERAGE_METRIC_MAP[metric] ?? metric;
  return coverage.metrics?.find((item) => item.metric === reportMetric)?.populated ?? 0;
}

export function prioritise(sources, coverage) {
  const total = Number(coverage.total_suburb_snapshots ?? 0);
  return sources
    .filter((source) => Number(source.priority?.estimated_addressable_geographies ?? 0) > 0)
    .map((source) => {
      const ceiling = Math.min(total, Number(source.priority.estimated_addressable_geographies));
      const reliability = Number(source.priority.reliability_weight ?? 0.5);
      const accessibility = Number(source.priority.accessibility_weight ?? 0.5);
      const mapping = Number(source.priority.mapping_weight ?? 0.5);
      const effort = Math.max(1, Number(source.priority.effort ?? 3));
      const licence = source.licence?.status === "verified_reusable" ? 1 : 0.25;
      const score = ceiling * reliability * accessibility * mapping * licence / effort;
      return {
        source_id: source.source_id,
        jurisdiction: source.jurisdiction,
        metric_family: source.metric_family,
        evidence: "estimated",
        estimated_addressable_ceiling: ceiling,
        score: Number(score.toFixed(3)),
        blockers: source.blockers ?? [],
        disposition: source.disposition,
        warning: "Opportunity ranking only; not achieved or published coverage.",
      };
    })
    .sort((a, b) => b.score - a.score || a.source_id.localeCompare(b.source_id));
}

export function simulate({ coverage, candidateObservations = [], publishedGeographyIdsByMetric = {}, estimatedOnly = {} }) {
  const total = Number(coverage.total_suburb_snapshots ?? 0);
  const candidates = new Map();
  for (const row of candidateObservations) {
    if (!candidates.has(row.metric)) candidates.set(row.metric, new Set());
    candidates.get(row.metric).add(row.geographyId);
  }

  const targetMetrics = new Set([
    ...Object.keys(COVERAGE_METRIC_MAP),
    ...candidates.keys(),
    ...Object.keys(estimatedOnly),
  ]);
  const metrics = [];
  for (const metric of [...targetMetrics].sort()) {
    const published = coverageCount(coverage, metric);
    const localIds = candidates.get(metric) ?? new Set();
    const publishedIds = publishedGeographyIdsByMetric[metric];
    const canResolveNew = Array.isArray(publishedIds);
    const publishedSet = new Set(publishedIds ?? []);
    const newIds = canResolveNew ? [...localIds].filter((id) => !publishedSet.has(id)).sort() : null;
    metrics.push({
      metric,
      total_geographies: total,
      current_published: published,
      after_published: published,
      verified_local_candidate: localIds.size,
      verified_new_geographies: newIds?.length ?? null,
      verified_new_geography_ids: newIds,
      estimated_only_ceiling: Number(estimatedOnly[metric] ?? 0),
      unavailable: Math.max(0, total - published),
      evidence_separation: "after_published is unchanged until a separately approved database validation/publication run",
    });
  }

  const comparableKey = (row) => `${row.geographyId}|${row.propertyType ?? "unspecified"}`;
  const isTwelveMonthsApart = (left, right) => {
    const a = new Date(`${left}T00:00:00Z`);
    const b = new Date(`${right}T00:00:00Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
    const earlier = a < b ? a : b;
    const later = a < b ? b : a;
    return later.getUTCFullYear() - earlier.getUTCFullYear() === 1
      && later.getUTCMonth() === earlier.getUTCMonth()
      && later.getUTCDate() === earlier.getUTCDate();
  };

  const pricePeriods = new Map();
  for (const row of candidateObservations.filter((item) => /median_sale_price/.test(item.metric))) {
    const key = comparableKey(row);
    if (!pricePeriods.has(key)) pricePeriods.set(key, new Set());
    pricePeriods.get(key).add(row.reportingPeriod);
  }
  const localGrowthUnlock = [...pricePeriods.values()].filter((periodSet) => {
    const periods = [...periodSet].sort();
    return periods.some((left, index) => periods.slice(index + 1).some((right) => isTwelveMonthsApart(left, right)));
  }).length;

  const priceIds = new Set(candidateObservations.filter((row) => /median_sale_price/.test(row.metric)).map(comparableKey));
  const rentIds = new Set(candidateObservations.filter((row) => /median_weekly_rent/.test(row.metric)).map(comparableKey));
  const localYieldUnlock = [...priceIds].filter((id) => rentIds.has(id)).length;

  return {
    total_geographies: total,
    metrics,
    derived_unlocks: {
      verified_local_yield: localYieldUnlock,
      verified_local_growth_12m: localGrowthUnlock,
      note: "Counts use candidate rows only; published/candidate intersections require explicit geography-ID sets.",
    },
    production_coverage_changed: false,
  };
}
