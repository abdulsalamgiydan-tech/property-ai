#!/usr/bin/env node
/**
 * Static secret-scanning check (Sprint 17.5 closeout, Workstream O).
 *
 * Three static scans, no live network calls, no external scanning tool
 * dependency (gitleaks/trufflehog considered and deferred — see
 * warehouse/reports/sprint17_5_release_readiness_summary.md):
 *   1. every git-tracked file, for common secret shapes
 *   2. built .next/ artifacts, if present (requires `npm run build` first)
 *   3. .next/** /*.js.map source maps specifically, since these commonly
 *      leak server-side literals accidentally inlined during dev builds
 *
 * Cloned from the same pattern as check_rls_policies.mjs /
 * check_warehouse_files.mjs: pure fs/execSync + regex, exits non-zero on
 * failure, never prints an unredacted match.
 *
 * Run: npm run security:secrets:check
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

/**
 * Secret shape patterns. Minimum lengths are chosen deliberately so the
 * documented placeholders in .env.example (e.g. "sk-ant-...", "eyJ...")
 * never match — only sufficiently long, real secret material does.
 */
export const SECRET_PATTERNS = [
  { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "Provider API key (sk-...)", regex: /\bsk-[a-zA-Z0-9_-]{20,}\b/g },
  { name: "JWT-shaped token", regex: /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g },
  { name: "PEM private key header", regex: /-----BEGIN(?: RSA| EC| OPENSSH)? PRIVATE KEY-----/g },
];

/**
 * Env-style `KEY=value` lines whose key name matches this pattern are safe
 * by design — Supabase anon keys and NEXT_PUBLIC_* values are meant for
 * client/public exposure (see .env.example) — and are never flagged
 * regardless of shape.
 */
const ALLOWED_ENV_KEY_PATTERN = /^(NEXT_PUBLIC_[A-Z0-9_]+|WAREHOUSE_SUPABASE_URL|WAREHOUSE_SUPABASE_ANON_KEY)$/;

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".woff", ".woff2",
  ".ttf", ".eot", ".pdf", ".zip", ".parquet", ".duckdb", ".shp", ".dbf", ".gpkg",
]);

/**
 * Scan a single text blob line by line. Returns findings with the matched
 * value truncated/redacted so a failing check never prints a usable secret.
 */
export function scanText(text, { allowedValues = new Set(), source = "" } = {}) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const envMatch = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (envMatch && ALLOWED_ENV_KEY_PATTERN.test(envMatch[1])) return;

    for (const { name, regex } of SECRET_PATTERNS) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(line))) {
        if (allowedValues.has(m[0])) continue;
        findings.push({
          source,
          line: index + 1,
          name,
          redacted: `${m[0].slice(0, 6)}…(redacted, ${m[0].length} chars)`,
        });
      }
    }
  });
  return findings;
}

function readSafely(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function collectFiles(dir, { maxFiles = 5000 } = {}) {
  const out = [];
  const stack = [dir];
  while (stack.length && out.length < maxFiles) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

function allowedValuesFromEnv() {
  const values = new Set();
  for (const [key, value] of Object.entries(process.env)) {
    if (ALLOWED_ENV_KEY_PATTERN.test(key) && value) values.add(value);
  }
  return values;
}

function runCli() {
  let failures = 0;
  const allowedValues = allowedValuesFromEnv();

  function report(label, findings) {
    if (findings.length === 0) {
      console.log(`  ok   ${label}`);
      return;
    }
    failures += findings.length;
    console.error(`  FAIL ${label} — ${findings.length} potential secret(s) found`);
    for (const f of findings) {
      console.error(`         ${f.source}:${f.line} — ${f.name} — ${f.redacted}`);
    }
  }

  console.log("Secret scan 1/3 — git-tracked files\n");
  const tracked = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => !BINARY_EXTENSIONS.has(path.extname(f).toLowerCase()));
  let trackedFindings = [];
  for (const relPath of tracked) {
    const text = readSafely(path.join(repoRoot, relPath));
    if (text === null) continue;
    trackedFindings = trackedFindings.concat(scanText(text, { allowedValues, source: relPath }));
  }
  report(`git-tracked source (${tracked.length} files)`, trackedFindings);

  console.log("\nSecret scan 2/3 — built .next/ artifacts\n");
  const nextDir = path.join(repoRoot, ".next");
  if (!fs.existsSync(nextDir)) {
    console.log("  skip built-artifact scan — .next/ not present (run `npm run build` first for full coverage)");
  } else {
    // .next/cache and .next/dev are Next.js/Turbopack's own incremental build
    // and dev-server caches — never shipped to users, not part of the
    // deployed output. Only .next/static and .next/server (etc.) are what a
    // browser or attacker can actually receive, so that's what's scanned.
    const artifactFiles = collectFiles(nextDir)
      .filter((f) => !BINARY_EXTENSIONS.has(path.extname(f).toLowerCase()) && !f.endsWith(".map"))
      .filter((f) => {
        const rel = path.relative(nextDir, f);
        return !rel.startsWith(`cache${path.sep}`) && !rel.startsWith(`dev${path.sep}`);
      });
    let artifactFindings = [];
    for (const filePath of artifactFiles) {
      const text = readSafely(filePath);
      if (text === null) continue;
      artifactFindings = artifactFindings.concat(
        scanText(text, { allowedValues, source: path.relative(repoRoot, filePath) })
      );
    }
    report(`.next/ build output (${artifactFiles.length} files)`, artifactFindings);

    console.log("\nSecret scan 3/3 — source maps (.next/**/*.js.map)\n");
    const mapFiles = collectFiles(nextDir)
      .filter((f) => f.endsWith(".js.map"))
      .filter((f) => {
        const rel = path.relative(nextDir, f);
        return !rel.startsWith(`cache${path.sep}`) && !rel.startsWith(`dev${path.sep}`);
      });
    let mapFindings = [];
    for (const filePath of mapFiles) {
      const text = readSafely(filePath);
      if (text === null) continue;
      mapFindings = mapFindings.concat(
        scanText(text, { allowedValues, source: path.relative(repoRoot, filePath) })
      );
    }
    report(`source maps (${mapFiles.length} files)`, mapFindings);
  }

  console.log("");
  if (failures > 0) {
    console.error(`Secret scan FAILED — ${failures} potential secret(s) found`);
    process.exit(1);
  }
  console.log("Secret scan passed — no leaked secrets detected");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runCli();
