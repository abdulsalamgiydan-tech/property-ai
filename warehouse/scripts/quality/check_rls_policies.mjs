#!/usr/bin/env node
/**
 * Static RLS policy coverage check (Sprint 13 Phase 1, Workstream 8b).
 *
 * Every `public.*` user table must be provably isolated to its owning
 * user by reading migration SQL text, never by trusting narrative claims.
 * This is deliberately a STATIC check (no live database connection, no
 * cross-user writes) — see warehouse/reports/sprint13_execution_plan.md
 * for why: there is no safe non-production branch for the main app's
 * Supabase project to run live RLS integration tests against, unlike the
 * warehouse-validation branch. This script is the agreed alternative.
 *
 * Cloned from the same pattern as check_warehouse_files.mjs: pure
 * fs.readFileSync + string/regex assertions, exits non-zero on failure.
 *
 * Run: npm run warehouse:rls:check
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const STANDARD_OPS = ["select", "insert", "update", "delete"];

/**
 * Tables that deliberately do NOT follow the standard
 * `auth.uid() = user_id` shape on every operation, and why. Any new table
 * that wants to deviate from the standard shape must be added here
 * explicitly — an unlisted deviation is a checker FAILURE, not a silent
 * pass, so a future author has to make a conscious decision.
 */
export const KNOWN_EXCEPTIONS = {
  waitlist: {
    reason:
      "Pre-auth email capture — magic link is sent before sign-in, so inserts must be anonymous; only service_role may read; no update/delete surface exists.",
    requiredOps: ["select", "insert"],
    checks: {
      select: (body) => body.includes("auth.role() = 'service_role'"),
      insert: (body) => body.includes("with check (true)"),
    },
  },
  strategy_generations: {
    reason:
      "Append-only rate-limit event log (one row per generation, used to count recent activity) — rows are never updated or deleted by design, so no update/delete policy exists.",
    requiredOps: ["select", "insert"],
  },
  research_copilot_queries: {
    reason:
      "Sprint 14 WS5 — append-only rate-limit/audit log for the research copilot (one row per question asked), same shape as strategy_generations — rows are never updated or deleted by design, so no update/delete policy exists.",
    requiredOps: ["select", "insert"],
  },
  user_feedback: {
    reason:
      "Sprint 14 WS21 — append-only in-app feedback submissions, same shape as strategy_generations/research_copilot_queries — feedback is meant to be an honest, unaltered record, so no update/delete policy exists.",
    requiredOps: ["select", "insert"],
  },
  user_entitlements: {
    reason:
      "Entitlement/tier table (Sprint 13 WS11, schema only — no billing activation) — users may read their own tier but must NEVER be able to write it themselves (self-elevation to a paid tier), so there is deliberately no insert/update/delete policy for the authenticated/anon role, only a service_role-only 'for all' policy.",
    requiredOps: ["select"],
  },
  investment_shortlist_change_events: {
    reason:
      "V7A (migration 062) — change alerts are written ONLY by the SECURITY DEFINER detector (detect_shortlist_change_events_v1), never by a client, so a user cannot forge an alert. The authenticated role gets no INSERT privilege and there is deliberately no insert policy; users may read/mark-seen (update)/dismiss (delete) their own rows via the standard auth.uid() = user_id predicate.",
    requiredOps: ["select", "update", "delete"],
  },
  deal_listing_feedback: {
    reason:
      "V7B (migration 063) — append-only feedback signals (saved/passed/rejected+reason/etc) that drive transparent preference proposals. Same append-only shape as strategy_generations/user_feedback: an honest, unaltered record, so there is deliberately no update/delete policy.",
    requiredOps: ["select", "insert"],
  },
};

/** Extract every `public.<table>` created via `create table if not exists`. */
export function extractPublicTables(sqlLower) {
  const names = new Set();
  const re = /create table if not exists public\.(\w+)/g;
  let m;
  while ((m = re.exec(sqlLower))) names.add(m[1]);
  return [...names];
}

/**
 * Parse RLS coverage for one table out of the (lowercased) concatenated
 * migration corpus. Returns { hasRls, ops: { select, insert, update, delete } }
 * where each op is true only if a `create policy ... on public.<table> for
 * <op> ...` statement exists AND its predicate matches the expected shape
 * for that table (standard `auth.uid() = user_id`, or its InitPlan-
 * optimised form `(select auth.uid()) = user_id` — see Sprint 15's
 * baseline audit — or the table's declared exception check).
 */
export function checkTableRlsCoverage(sqlLower, table, exceptions = KNOWN_EXCEPTIONS) {
  const hasRls = sqlLower.includes(`alter table public.${table} enable row level security`);
  const exception = exceptions[table];
  const requiredOps = exception?.requiredOps ?? STANDARD_OPS;

  const ops = { select: false, insert: false, update: false, delete: false };
  const policyRe = new RegExp(`create policy[^;]*?on public\\.${table}\\b\\s+for\\s+(select|insert|update|delete)([^;]*);`, "g");
  let pm;
  while ((pm = policyRe.exec(sqlLower))) {
    const op = pm[1];
    const body = pm[2];
    const customCheck = exception?.checks?.[op];
    if (customCheck) {
      if (customCheck(body)) ops[op] = true;
      continue;
    }
    // Accept both auth.uid() and the (select auth.uid()) InitPlan-optimised
    // form recommended by Supabase's own performance advisor (Sprint 15
    // baseline audit) — same predicate, same isolation guarantee, just
    // evaluated once per statement instead of once per row.
    if (op === "insert") {
      if (
        body.includes("with check (auth.uid() = user_id)") ||
        body.includes("with check ((select auth.uid()) = user_id)")
      )
        ops.insert = true;
    } else if (
      body.includes("using (auth.uid() = user_id)") ||
      body.includes("using ((select auth.uid()) = user_id)")
    ) {
      ops[op] = true;
    }
  }

  return { hasRls, ops, requiredOps, exceptionReason: exception?.reason };
}

function runCli() {
  const migrationsDir = path.join(repoRoot, "supabase", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const corpus = files.map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8")).join("\n").toLowerCase();
  const tables = extractPublicTables(corpus);

  let failures = 0;
  function check(label, ok, detail) {
    if (ok) {
      console.log(`  ok   ${label}`);
    } else {
      failures += 1;
      console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    }
  }

  console.log(`RLS policy coverage check (${tables.length} public tables found)\n`);

  for (const table of tables.sort()) {
    const { hasRls, ops, requiredOps, exceptionReason } = checkTableRlsCoverage(corpus, table);
    console.log(`${table}${exceptionReason ? ` (documented exception: ${exceptionReason})` : ""}:`);
    check(`${table} — row level security enabled`, hasRls);
    for (const op of requiredOps) {
      check(`${table} — ${op} policy enforces expected predicate`, ops[op]);
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`RLS policy check FAILED — ${failures} issue(s) found`);
    process.exit(1);
  }
  console.log("RLS policy check passed — every public table has documented, enforced isolation");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runCli();
