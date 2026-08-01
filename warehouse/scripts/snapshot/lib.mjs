/**
 * Shared primitives for the warehouse snapshot export/import/inspect/verify/
 * cleanup tools (Sprint 18.2, Phase 7).
 *
 * Single source of truth for the 21-table minimum launch contract (traced
 * via pg_depend/pg_get_functiondef in Sprint 18.2 Phase 4 -- see
 * warehouse/reports/sprint18_2_minimum_launch_contract.md) and for the
 * Production-deny safety guard every other script in this module reuses.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
export const rel = (...p) => path.join(repoRoot, ...p);

export const PROD_REF = "oshquaxsloolqucwvigc";
export const BRANCH_REF = "lzonauinzatmtytyoems";

/** The exact 21-table minimum launch contract. Every script imports this
 * rather than re-declaring it -- one place the contract lives in code.
 *
 * Order is FK-dependency-safe (root tables first), not merely grouped by
 * schema -- import.mjs loads tables in this exact order, and `mart.*` FKs
 * to `meta.jurisdiction`, so meta must precede mart. Found as a real bug
 * during the Sprint 18.2 Phase 9 import rehearsal: the migrations
 * (049 core -> 050 meta -> 051 mart) already got CREATE TABLE order right,
 * but this list had mart before meta, which only matters for import/data
 * order, not schema creation, so the mismatch went unnoticed until data
 * actually flowed through it. */
export const TABLE_ALLOW_LIST = Object.freeze([
  "core.dim_geography",
  "meta.jurisdiction",
  "meta.source",
  "meta.dataset",
  "meta.dataset_freshness_status",
  "meta.dataset_refresh_run",
  "meta.metric_assumption",
  "meta.metric_lineage_registry",
  "meta.data_quality_rule",
  "meta.data_quality_run",
  "meta.data_incident",
  "meta.data_quarantine_summary",
  "mart.suburb_market_snapshot",
  "mart.postcode_market_snapshot",
  "mart.suburb_demographic_profile_2021",
  "mart.postcode_demographic_profile_2021",
  "mart.suburb_market_timeseries",
  "mart.postcode_market_timeseries",
  "mart.suburb_rent_quarterly",
  "mart.postcode_rent_quarterly",
  "mart.lga_rent_quarterly",
]);

/** Columns that exist on warehouse-validation's fuller table shape but are
 * deliberately excluded from the minimum launch contract (traced via
 * pg_depend/pg_get_functiondef -- confirmed unused by any of the 10 granted
 * views or 8 granted functions -- see
 * warehouse/reports/sprint18_2_minimum_launch_contract.md). The Production
 * bootstrap migrations (048-054) never create these columns, so the
 * snapshot must not export them either -- found as a real bug during the
 * Sprint 18.2 Phase 9 import rehearsal (import.mjs correctly refused to
 * import into a target "missing" a column the export had included). */
export const COLUMN_EXCLUDE_LIST = Object.freeze({
  "core.dim_geography": ["geom"],
  // unique_signature is `generated always as (...) stored` -- Postgres
  // computes it automatically from the other imported columns and refuses
  // an explicit COPY target list that names a generated column. No data
  // loss: the target recomputes the identical value from the same inputs.
  "meta.data_incident": ["unique_signature"],
});

export function loadLocalEnv() {
  try {
    process.loadEnvFile(rel(".env.local"));
  } catch {
    // absent in CI/rehearsal environments -- callers fall back to whatever
    // env vars are already set (e.g. a disposable-database URL).
  }
}

/**
 * Refuses any connection string that references Production unless BOTH an
 * explicit CLI acknowledgement and an explicit env var are set together --
 * a single flag is never enough, so one accidental copy-paste can't
 * silently target Production.
 */
export function assertNotProduction(url, { cliAcknowledged = false } = {}) {
  if (!url) throw new Error("connection string is required");
  if (url.includes(PROD_REF)) {
    const envAcknowledged = process.env.SNAPSHOT_ALLOW_PRODUCTION_TARGET === "true";
    if (!cliAcknowledged || !envAcknowledged) {
      throw new Error(
        "Refusing to target Production (ref " +
          PROD_REF +
          ") -- this requires BOTH the --i-acknowledge-production-target CLI flag " +
          "AND SNAPSHOT_ALLOW_PRODUCTION_TARGET=true set together. Neither alone is enough."
      );
    }
  }
}

/** Safe-to-print description of a connection string -- never returns the
 * password portion. */
export function describeTarget(url) {
  const parsed = new URL(url);
  const maskedUrl = url.replace(/:\/\/([^:/]+):[^@]+@/, "://$1:***@");
  const knownRef = url.includes(PROD_REF)
    ? "PRODUCTION"
    : url.includes(BRANCH_REF)
      ? "warehouse-validation"
      : "unknown/local";
  return { host: parsed.hostname, maskedUrl, knownRef };
}

/** Same safety classification as describeTarget(), but for a bare hostname
 * rather than a full connection string (used by the PG*-env-var target
 * mode, which never constructs a URL at all). */
export function describeHost(host) {
  const knownRef = host.includes(PROD_REF)
    ? "PRODUCTION"
    : host.includes(BRANCH_REF)
      ? "warehouse-validation"
      : "unknown/local";
  return { host, maskedUrl: `postgresql://***@${host}/***`, knownRef };
}

/**
 * Resolves the import/verify target from CLI args, supporting two modes:
 *
 * 1. `--target-url-env=<ENV_VAR_NAME>` (original): reads a full connection
 *    string from that named env var.
 * 2. `--target-pg-env` (Sprint 18.3): reads the standard libpq environment
 *    variables (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE) that `pg`
 *    itself understands -- lets a human-assisted secure runner (PowerShell
 *    Read-Host -AsSecureString -> process-scoped PGPASSWORD) supply a
 *    credential that never touches a file, a CLI argument, or a
 *    constructed URL string. Returns a `pg.Client`-compatible config
 *    object, never a URL, so there is no encoding step to get wrong.
 *
 * Both modes run through the same Production-deny and describe-target
 * logic so neither path is a lesser-checked back door.
 */
export function resolveTarget(args) {
  if (args["target-pg-env"]) {
    const host = process.env.PGHOST;
    if (!host) throw new Error("--target-pg-env requires PGHOST to be set");
    if (!process.env.PGPASSWORD) throw new Error("--target-pg-env requires PGPASSWORD to be set");
    assertNotProduction(host, { cliAcknowledged: Boolean(args["i-acknowledge-production-target"]) });
    const targetInfo = describeHost(host);
    const clientConfig = {
      host,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || "postgres",
    };
    // hostKey must be derivable without the password for checkpoint/report
    // filenames -- reuse the same sha256(host) scheme as targetKey(url).
    const hostKey = crypto.createHash("sha256").update(host).digest("hex").slice(0, 12);
    return { clientConfig, targetInfo, hostKey };
  }

  const envName = args["target-url-env"];
  if (!envName) {
    throw new Error(
      "Either --target-url-env=<ENV_VAR_NAME> or --target-pg-env is required (the connection string/password is never a CLI argument)"
    );
  }
  const targetUrl = process.env[envName];
  if (!targetUrl) throw new Error(`Environment variable ${envName} is not set`);
  assertNotProduction(targetUrl, { cliAcknowledged: Boolean(args["i-acknowledge-production-target"]) });
  const targetInfo = describeTarget(targetUrl);
  const hostKey = targetKey(targetUrl);
  return { clientConfig: { connectionString: targetUrl }, targetInfo, hostKey };
}

/** Validates a CLI-supplied table subset is contained in the allow-list;
 * defaults to the full allow-list when nothing is supplied. */
export function resolveTables(explicitList) {
  if (!explicitList || explicitList.length === 0) return [...TABLE_ALLOW_LIST];
  const invalid = explicitList.filter((t) => !TABLE_ALLOW_LIST.includes(t));
  if (invalid.length) {
    throw new Error(`Tables not in the allow-list: ${invalid.join(", ")}`);
  }
  return explicitList;
}

export function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export async function writeJsonAtomic(filePath, data) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, filePath);
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function snapshotDir(snapshotId) {
  return rel("warehouse", "data", "snapshots", snapshotId);
}

export function manifestPath(snapshotId) {
  return path.join(snapshotDir(snapshotId), "manifest.json");
}

export function checksumsPath(snapshotId) {
  return path.join(snapshotDir(snapshotId), "checksums.json");
}

export function tableFilePath(snapshotId, table) {
  return path.join(snapshotDir(snapshotId), "tables", `${table}.copy`);
}

export function importStateDir(snapshotId) {
  return path.join(snapshotDir(snapshotId), "import_state");
}

/** Short, stable key identifying a target host for report/checkpoint
 * filenames -- never the connection string itself. */
export function targetKey(url) {
  const host = new URL(url).hostname;
  return crypto.createHash("sha256").update(host).digest("hex").slice(0, 12);
}

/**
 * Tracks per-table import progress so a crash mid-run leaves an accurate,
 * resumable record. Mirrors the resumable-run-state convention already used
 * by warehouse/scripts/orchestration/refresh_engine_v3.mjs.
 */
export class ProgressCheckpoint {
  constructor(snapshotId, targetHostKey) {
    this.dir = importStateDir(snapshotId);
    this.progressFile = path.join(this.dir, `${targetHostKey}.progress.json`);
    this.completedFile = path.join(this.dir, `${targetHostKey}.completed.json`);
  }

  load() {
    if (fs.existsSync(this.progressFile)) return readJson(this.progressFile);
    return null;
  }

  isCompleted() {
    return fs.existsSync(this.completedFile);
  }

  async save(state) {
    await writeJsonAtomic(this.progressFile, state);
  }

  async complete(state) {
    await writeJsonAtomic(this.completedFile, state);
    if (fs.existsSync(this.progressFile)) await fsp.unlink(this.progressFile);
  }
}

/**
 * Bounds every statement on this connection, so a client-side bug that
 * leaves a COPY sub-protocol exchange half-finished (the client never sends
 * CopyDone/CopyFail) doesn't strand the connection -- and a server-side
 * Postgres backend -- in an active COPY-receiving state indefinitely.
 * Discovered as a real gap during Sprint 18.2 Phase 7 rehearsal: a crashed
 * client left a backend running an active COPY for the entire time this
 * wasn't set. Defense-in-depth alongside the stream.destroy()-on-error fix
 * in export.mjs/import.mjs.
 */
export async function applyStatementTimeout(client, ms = 10 * 60 * 1000) {
  await client.query(`set statement_timeout = ${Number(ms)}`);
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (const raw of argv) {
    if (raw.startsWith("--")) {
      const [key, ...rest] = raw.slice(2).split("=");
      args[key] = rest.length ? rest.join("=") : true;
    } else {
      args._.push(raw);
    }
  }
  return args;
}
