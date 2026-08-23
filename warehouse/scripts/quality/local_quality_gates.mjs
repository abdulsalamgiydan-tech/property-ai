/**
 * Deterministic, offline admission gates for one candidate source batch.
 *
 * No network and no database access. A blocking failure excludes the batch from
 * a publication review packet; quarantined source rows remain evidence but are
 * never silently converted into accepted observations.
 */

const STATES = new Set(["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]);
const GEOGRAPHY_TYPES = new Set(["SAL", "POA", "LGA", "SA2", "STATE"]);
const SIGNED_METRICS = new Set(["annual_price_growth_12m", "price_growth_12m"]);
const BLOCKING = "blocking";

export function rowNaturalKey(row) {
  return [row.sourceId, row.geographyId, row.metric, row.propertyType, row.reportingPeriod]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .join("|");
}

function validIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function validMetricValue(metric, value) {
  return Number.isFinite(value) && (SIGNED_METRICS.has(String(metric ?? "").trim()) || value > 0);
}

function rowErrors(row, sourceId) {
  const errors = [];
  if (!String(row.geographyId ?? "").trim()) errors.push("missing_geography");
  if (!GEOGRAPHY_TYPES.has(row.geographyType)) errors.push("invalid_geography_type");
  if (!String(row.geographyLabel ?? "").trim()) errors.push("missing_geography_label");
  if (!STATES.has(row.state)) errors.push("invalid_state");
  if (!String(row.metric ?? "").trim()) errors.push("missing_metric");
  if (!validMetricValue(row.metric, row.value)) errors.push("invalid_value_for_metric");
  if (!String(row.unit ?? "").trim()) errors.push("missing_unit");
  if (!String(row.propertyType ?? "").trim()) errors.push("missing_property_type");
  if (!validIsoDate(row.reportingPeriod)) errors.push("invalid_reporting_period");
  if (!validIsoDate(row.sourcePublished)) errors.push("invalid_source_published");
  if (!validTimestamp(row.acquiredAt)) errors.push("invalid_acquired_at");
  if (row.sourceId !== sourceId) errors.push("source_mismatch");
  if (!/^[a-f0-9]{64}$/i.test(row.fileChecksum ?? "")) errors.push("invalid_file_checksum");
  if (!String(row.adapterVersion ?? "").trim() || !String(row.schemaVersion ?? "").trim()) errors.push("missing_version_lineage");
  if (!new Set(["direct", "derived", "fallback"]).has(row.classification)) errors.push("invalid_classification");
  if (!new Set(["fresh", "stale", "expired", "unknown"]).has(row.freshness)) errors.push("invalid_freshness");
  if (!new Set(["high", "medium", "low"]).has(row.confidence)) errors.push("invalid_confidence");
  return errors;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (sorted.length === 0) return null;
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
}

function gate(id, passed, details, severity = BLOCKING) {
  return { id, passed, severity, details };
}

export function runLocalQualityGates(batch) {
  const rows = Array.isArray(batch.rows) ? batch.rows : [];
  const quarantined = Array.isArray(batch.quarantined) ? batch.quarantined : [];
  const file = batch.fileMeta ?? {};
  const gates = [];

  const fileOk = Number(file.bytes) >= Number(batch.minBytes ?? 1)
    && file.complete !== false
    && file.looksHtml !== true
    && !/^text\/html\b/i.test(String(file.mime ?? ""));
  gates.push(gate("file_integrity", fileOk, fileOk ? "size/MIME/completeness accepted" : "empty, partial or HTML-as-data input"));

  const sourceOk = Boolean(batch.sourceId)
    && (!batch.expectedSourceId || batch.sourceId === batch.expectedSourceId)
    && (!batch.expectedLicence || batch.sourceLicence === batch.expectedLicence);
  gates.push(gate("source_and_licence", sourceOk, sourceOk ? "source/licence match" : "source or licence mismatch"));

  const schemaOk = Boolean(batch.schemaFingerprint)
    && (!batch.priorSchemaFingerprint || batch.schemaFingerprint === batch.priorSchemaFingerprint);
  gates.push(gate("schema_fingerprint", schemaOk, schemaOk ? "schema fingerprint accepted" : "missing or materially changed schema"));

  const invalidRows = rows.flatMap((row, index) => {
    const errors = rowErrors(row, batch.sourceId);
    return errors.length ? [{ index, errors }] : [];
  });
  gates.push(gate("observation_contract", rows.length > 0 && invalidRows.length === 0,
    rows.length === 0 ? "no accepted observations" : `${invalidRows.length} invalid observation(s)`));

  const keys = rows.map(rowNaturalKey);
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  gates.push(gate("natural_key_uniqueness", duplicates.length === 0,
    duplicates.length ? `${new Set(duplicates).size} duplicate natural key(s)` : "unique natural keys"));

  const previous = Number(batch.previousAcceptedRows ?? 0);
  const minimumRatio = Number(batch.minimumCoverageRatio ?? 0.7);
  const ratio = previous > 0 ? rows.length / previous : 1;
  gates.push(gate("coverage_collapse", previous === 0 || ratio >= minimumRatio,
    previous === 0 ? "no previous candidate baseline" : `candidate ratio ${ratio.toFixed(3)} (minimum ${minimumRatio})`));

  const minimumSampleSize = Number(batch.minimumSampleSize ?? 0);
  const insufficientSamples = minimumSampleSize > 0
    ? rows.filter((row) => !Number.isInteger(row.sampleSize) || row.sampleSize < minimumSampleSize)
    : [];
  gates.push(gate("minimum_sample_size", insufficientSamples.length === 0,
    minimumSampleSize === 0
      ? "not required for this metric/source contract"
      : `${insufficientSamples.length} row(s) below required sample ${minimumSampleSize}`));

  const maximumMedianShiftRatio = Number(batch.maximumMedianShiftRatio ?? 4);
  const metrics = [...new Set(rows.map((row) => row.metric))];
  const shifts = metrics.map((metric) => {
    const currentMedian = median(rows.filter((row) => row.metric === metric).map((row) => row.value));
    const priorMedian = Number(batch.priorMediansByMetric?.[metric] ?? (metrics.length === 1 ? batch.priorMedian : Number.NaN));
    const ratioForMetric = Number.isFinite(priorMedian) && priorMedian > 0 && currentMedian != null
      ? Math.max(currentMedian / priorMedian, priorMedian / currentMedian)
      : 1;
    return { metric, ratio: ratioForMetric };
  });
  const shifted = shifts.filter((item) => item.ratio > maximumMedianShiftRatio);
  gates.push(gate("distribution_shift", shifted.length === 0,
    `${shifts.map((item) => `${item.metric}:${item.ratio.toFixed(3)}`).join(", ") || "no metrics"} (maximum ${maximumMedianShiftRatio})`));

  const rerun = Array.isArray(batch.rerunNaturalKeys) ? [...batch.rerunNaturalKeys].sort() : null;
  const current = [...new Set(keys)].sort();
  const idempotent = rerun == null || JSON.stringify(rerun) === JSON.stringify(current);
  gates.push(gate("idempotent_rerun", idempotent, idempotent ? "stable natural-key set" : "rerun natural keys changed"));

  gates.push(gate("quarantine_accounting", true, `${quarantined.length} source row(s) quarantined with reasons`, "informational"));

  const failures = gates.filter((item) => item.severity === BLOCKING && !item.passed);
  return {
    admit: failures.length === 0,
    sourceId: batch.sourceId ?? null,
    acceptedRows: rows.length,
    quarantinedRows: quarantined.length,
    invalidRows,
    duplicateNaturalKeys: [...new Set(duplicates)],
    gates,
    failures,
  };
}
