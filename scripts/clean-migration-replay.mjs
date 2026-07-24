#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { Client } from "pg";

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const outDir = path.join(repoRoot, "clean-replay-artifacts");
const outFile = path.join(outDir, "clean-migration-chain-001-044-report.json");

const requiredTables = [
  "research_copilot_queries",
  "user_onboarding_preferences",
  "user_feedback",
  "scenario_lab_cases",
  "user_entitlements",
  "watchlist_items",
  "property_reports",
];

const userOwnedTables = [
  "property_reports",
  "property_comparisons",
  "watchlist_items",
  "portfolio_properties",
  "strategy_generations",
  "strategy_reports",
  "scenario_lab_cases",
  "watchlist_change_events",
  "notification_preferences",
  "user_entitlements",
  "research_copilot_queries",
  "user_onboarding_preferences",
  "user_feedback",
];

function assertSafeLocalUrl(url) {
  if (!url) throw new Error("CLEAN_REPLAY_DATABASE_URL is required");
  const parsed = new URL(url);
  const host = parsed.hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("Refusing clean replay against a non-local database host");
  }
  if (url.includes("oshquaxsloolqucwvigc") || url.includes("lzonauinzatmtytyoems")) {
    throw new Error("Refusing clean replay against a real Supabase project ref");
  }
}

async function migrationFiles() {
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const first = files[0]?.slice(0, 3);
  const last = files.at(-1)?.slice(0, 3);
  if (first !== "001" || last !== "044") {
    throw new Error(`Expected migration span 001..044, got ${first}..${last}`);
  }
  return files;
}

async function bootstrapSupabasePrimitives(client) {
  await client.query(`
    create schema if not exists auth;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists postgis with schema extensions;

    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;

    create table if not exists auth.users (
      id uuid primary key,
      email text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create or replace function auth.role()
    returns text
    language sql
    stable
    as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
    $$;
  `);
}

async function applyMigrations(client, files) {
  const applied = [];
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const started = performance.now();
    await client.query(sql);
    applied.push({ file, durationMs: Math.round(performance.now() - started) });
  }
  return applied;
}

async function collectChecks(client, files) {
  const tables = await client.query(
    `
      select schemaname, tablename
      from pg_tables
      where schemaname in ('public','meta','raw','staging','core','mart','audit')
      order by schemaname, tablename
    `
  );

  const policies = await client.query(
    `
      select schemaname, tablename, policyname, cmd, qual, with_check
      from pg_policies
      where schemaname = 'public'
      order by tablename, policyname
    `
  );

  const rls = await client.query(
    `
      select c.relname as table_name, c.relrowsecurity as rls_enabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname = any($1::text[])
      order by c.relname
    `,
    [userOwnedTables]
  );

  const functions = await client.query(
    `
      select n.nspname as schema_name, p.proname as function_name, p.prosecdef as security_definer
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
      order by n.nspname, p.proname
    `
  );

  const triggers = await client.query(
    `
      select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
      from information_schema.triggers
      where event_object_schema = 'public'
      order by event_object_table, trigger_name
    `
  );

  const required = await client.query(
    `
      select t as table_name, to_regclass('public.' || t) is not null as exists
      from unnest($1::text[]) as t
      order by t
    `,
    [requiredTables]
  );

  const missing = required.rows.filter((row) => !row.exists).map((row) => row.table_name);
  const rlsMissing = rls.rows.filter((row) => !row.rls_enabled).map((row) => row.table_name);
  const migrationNumbers = files.map((file) => file.slice(0, 3));
  const deterministicOrder =
    migrationNumbers.length === 44 &&
    migrationNumbers.every((n, i) => n === String(i + 1).padStart(3, "0"));

  return {
    deterministicOrder,
    requiredTables: required.rows,
    missingRequiredTables: missing,
    userOwnedRls: rls.rows,
    userOwnedRlsMissing: rlsMissing,
    publicPolicyCount: policies.rows.length,
    publicFunctionCount: functions.rows.length,
    publicTriggerCount: triggers.rows.length,
    totalSchemaTables: tables.rows.length,
    schemasPresent: [...new Set(tables.rows.map((row) => row.schemaname))].sort(),
    policySample: policies.rows.filter((row) =>
      ["research_copilot_queries", "user_onboarding_preferences", "user_feedback"].includes(row.tablename)
    ),
  };
}

async function main() {
  const databaseUrl = process.env.CLEAN_REPLAY_DATABASE_URL;
  assertSafeLocalUrl(databaseUrl);
  await fs.mkdir(outDir, { recursive: true });

  const files = await migrationFiles();
  const client = new Client({ connectionString: databaseUrl });
  const started = performance.now();

  const report = {
    status: "fail",
    startedAt: new Date().toISOString(),
    databaseHost: new URL(databaseUrl).hostname,
    migrationCount: files.length,
    firstMigration: files[0],
    lastMigration: files.at(-1),
    applied: [],
    checks: null,
    error: null,
  };

  try {
    await client.connect();
    await bootstrapSupabasePrimitives(client);
    report.applied = await applyMigrations(client, files);
    report.checks = await collectChecks(client, files);
    if (!report.checks.deterministicOrder) throw new Error("Migration files are not exactly ordered 001 through 044");
    if (report.checks.missingRequiredTables.length) throw new Error(`Missing required tables: ${report.checks.missingRequiredTables.join(", ")}`);
    if (report.checks.userOwnedRlsMissing.length) throw new Error(`Missing RLS on user-owned tables: ${report.checks.userOwnedRlsMissing.join(", ")}`);
    report.status = "pass";
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.durationMs = Math.round(performance.now() - started);
    await fs.writeFile(outFile, JSON.stringify(report, null, 2));
    await client.end().catch(() => {});
  }

  console.log(JSON.stringify({ status: report.status, migrationCount: report.migrationCount, artifact: "clean-replay-artifacts/clean-migration-chain-001-044-report.json" }));
}

main().catch((error) => {
  console.error(`clean migration replay failed: ${error.message}`);
  process.exit(1);
});
